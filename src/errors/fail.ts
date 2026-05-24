import { ERROR_REGISTRY, type ErrorCodeType } from "./registry";
import { WorkerError } from "./worker";
import type { WorkerErrorContext, WorkerErrorCategory } from "./types";
import { type WorkerValidationIssue } from "@/validation/zod";

// 1. Detect if the template requires a data payload argument
type InferData<T extends ErrorCodeType> =
  typeof ERROR_REGISTRY[T] extends { detail: (data: infer D) => string } ? D : never;

// 2. Determine if the signature requires data parameters based on structure
type IsDataRequired<T extends ErrorCodeType> =
  InferData<T> extends Record<string, never> // Handles functions with zero arguments like () => string
  ? false
  : [InferData<T>] extends [never] ? false : true;

// 3. Construct a fully dynamic union options payload
type FailOptions<T extends ErrorCodeType | string> = {
  code: T;
  title?: string;
  category?: WorkerErrorCategory;
  retryable?: boolean;
  fatal?: boolean;
  cause?: unknown;
  context?: WorkerErrorContext | null;
  issues?: WorkerValidationIssue[] | null;
} & (T extends ErrorCodeType
  ? (
    | { detail: string; data?: InferData<T> }
    | (IsDataRequired<T> extends true
      ? { detail?: never; data: InferData<T> }
      : { detail?: never; data?: InferData<T> })
  )
  : {
    title: string;
    detail: string;
    category: WorkerErrorCategory;
  });

export function fail<T extends ErrorCodeType | string>(options: FailOptions<T>): never {
  const { code, title, category, retryable, fatal, cause, context, issues } = options;
  const meta = ERROR_REGISTRY[code as ErrorCodeType];

  if (meta) {
    let resolvedDetail: string;

    if ('detail' in options && typeof options.detail === 'string') {
      resolvedDetail = options.detail;
    } else {
      const targetDetail = 'detail' in meta ? meta.detail : undefined;
      const inputData = (options as any).data ?? {};

      resolvedDetail = typeof targetDetail === 'function'
        ? (targetDetail as Function)(inputData)
        : String(targetDetail);
    }

    throw new WorkerError({
      code,
      title: title ?? meta.title,
      category: category ?? meta.category,
      fatal: fatal ?? meta.fatal,
      retryable: retryable ?? meta.retryable,
      detail: resolvedDetail,
      cause: cause ?? null,
      context: context ?? null,
      issues: issues ?? null,
    });
  }

  // Pure ad-hoc custom string signature layout engine
  throw new WorkerError({
    code,
    title: title ?? "Unhandled Application Fault",
    category: category ?? "internal",
    detail: (options as any).detail ?? "An unexpected runtime failure was triggered.",
    retryable: retryable ?? false,
    fatal: fatal ?? true,
    cause: cause ?? null,
    context: context ?? null,
    issues: issues ?? null,
  });
}
