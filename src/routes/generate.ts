import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../middleware/errors.js';
import type { GenerateResult, LLMProvider } from '../providers/types.js';

const generateSchema = z.strictObject({
  text: z
    .string()
    .trim()
    .min(1, 'must not be empty')
    .max(4000, 'must be at most 4000 characters'),
  system: z.string().trim().max(1000, 'must be at most 1000 characters').optional(),
  maxTokens: z
    .int('must be an integer')
    .min(1, 'must be at least 1')
    .max(1024, 'must be at most 1024')
    .default(512),
});

/** Turns the first validation issue into a message that names the field. */
function describeIssue(issue: z.core.$ZodIssue): string {
  if (issue.code === 'unrecognized_keys') {
    return `Unknown field(s): ${issue.keys.join(', ')}`;
  }
  if (issue.path.length === 0) {
    return 'Request body must be a JSON object (Content-Type: application/json)';
  }
  return `${issue.path.join('.')}: ${issue.message}`;
}

function getStatus(err: unknown): unknown {
  return typeof err === 'object' && err !== null && 'status' in err ? err.status : undefined;
}

/** Calls the provider and maps timeouts and failures to safe client-facing errors. */
async function callProvider(
  provider: LLMProvider,
  input: Omit<Parameters<LLMProvider['generate']>[0], 'signal'>,
  timeoutMs: number,
): Promise<GenerateResult> {
  const signal = AbortSignal.timeout(timeoutMs);
  // Racing against the signal enforces the timeout even if a provider ignores it.
  const timedOut = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });

  try {
    return await Promise.race([provider.generate({ ...input, signal }), timedOut]);
  } catch (err) {
    if (signal.aborted) {
      throw new ApiError(504, 'UPSTREAM_TIMEOUT', 'The model provider did not respond in time', {
        cause: err,
      });
    }
    if (getStatus(err) === 429) {
      throw new ApiError(429, 'RATE_LIMITED', 'The model provider is rate limiting requests. Try again later', {
        cause: err,
      });
    }
    throw new ApiError(502, 'UPSTREAM_ERROR', 'The model provider returned an error', { cause: err });
  }
}

export function generateRouter(provider: LLMProvider, timeoutMs: number) {
  const router = Router();

  // Express 5 forwards rejected promises from async handlers to the error handler.
  router.post('/generate', async (req, res) => {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', describeIssue(parsed.error.issues[0]));
    }

    const { text, system, maxTokens } = parsed.data;
    const result = await callProvider(
      provider,
      { text, system: system || undefined, maxTokens },
      timeoutMs,
    );

    res.json({
      output: result.output,
      provider: provider.name,
      model: result.model,
      usage: result.usage,
      requestId: res.locals.requestId,
    });
  });

  return router;
}
