import type {
  WorkerErrorCategory,
  WorkerErrorCode,
  WorkerErrorContext,
  WorkerErrorOptions,
  WorkerProblemDetails,
  WorkerErrorFallback
} from "./types";
import { formatZodIssues, type WorkerValidationIssue } from "@/validation/zod";
import {
  inferCategory,
  inferCode,
  inferDetail,
  inferFatal,
  inferRetryability,
  inferTitle
} from "./inferer";
import { ZodError } from "zod";
import { ERROR_REGISTRY, type ErrorCodeType } from "./registry";

function buildCause(cause: unknown): Error | undefined {
  if (cause instanceof Error) return cause;
  if (cause === undefined) return undefined;

  return new Error(typeof cause === "string" ? cause : JSON.stringify(cause));
}

function normalizeErrorType(code: WorkerErrorCode): string {
  return `urn:dpdp:worker:error:${code.toLowerCase().replace(/^dpdp_/, "")}`;
}

/**
 * WorkerError envelope mapped to RFC-7807-compatible problem details.
 */
export class WorkerError extends Error {
  readonly type: string;
  readonly code: WorkerErrorCode;
  readonly title: string;
  readonly detail: string;
  readonly category: WorkerErrorCategory;
  readonly retryable: boolean;
  readonly fatal: boolean;
  readonly context?: WorkerErrorContext | null;
  readonly issues?: WorkerValidationIssue[] | null;

  constructor(options: WorkerErrorOptions) {
    const cause = buildCause(options.cause)
    super(options.detail, { cause })

    this.name = "WorkerError";
    this.type = options.type ?? normalizeErrorType(options.code);
    this.code = options.code;
    this.title = options.title;
    this.detail = options.detail;
    this.category = options.category;
    this.retryable = options.retryable ?? false;
    this.fatal = options.fatal ?? false;
    this.context = options.context ?? null;

    /**
    * Issue resolution:
    * 1. Use explicitly provided issues.
    * 2. If missing, check if the cause is a ZodError and format it.
    * 3. Otherwise, null.
    */
    if (options.issues) {
      this.issues = options.issues;
    } else if (cause instanceof ZodError) {
      this.issues = formatZodIssues(cause);
    } else {
      this.issues = null;
    }
  }

  toProblem(instance?: string): WorkerProblemDetails {
    const causeProblem = this.cause ? asWorkerError(this.cause).toProblem() : undefined;

    const problem: WorkerProblemDetails = {
      type: this.type,
      code: this.code,
      title: this.title,
      detail: this.detail,
      category: this.category,
      retryable: this.retryable,
      fatal: this.fatal,
    };

    if (instance) problem.instance = instance;
    if (this.context) problem.context = this.context;
    if (this.issues && this.issues.length > 0) problem.issues = this.issues;
    if (causeProblem) problem.cause = causeProblem;

    return problem;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWorkerProblem(value: unknown): value is WorkerProblemDetails {
  return isRecord(value) && typeof value.code === "string" && typeof value.detail === "string";
}

/**
 * Constructs a normalized `WorkerError`
 * 
 * @param options - Error metadata and classification.
 * @returns Worker error instance
 */
export function workerError(options: WorkerErrorOptions): WorkerError {
  return new WorkerError(options)
}

/**
 * Normalizes unknown error into `WorkerError`, applying fallback defaults when needed
 * 
 * @param error - Unknown thrown value.
 * @param fallback - Optional fallback fields used when inference is ambiguous
 * @returns Normalized Worker Error
 */
export function asWorkerError(error: unknown, fallback: WorkerErrorFallback = {}): WorkerError {
  if (error instanceof WorkerError) return error;

  if (isWorkerProblem(error)) {
    return workerError({
      code: error.code,
      title: error.title,
      detail: error.detail,
      category: error.category,
      retryable: error.retryable,
      fatal: error.fatal,
      context: error.context,
      issues: error.issues,
      cause: error.cause,
      type: error.type,
    });
  };

  return workerError({
    code: inferCode(error, fallback),
    title: inferTitle(error, fallback),
    detail: inferDetail(error, fallback),
    category: inferCategory(error, fallback),
    retryable: inferRetryability(error, fallback),
    fatal: inferFatal(error, fallback),
    context: fallback.context,
    issues: error instanceof ZodError ? (fallback.issues ?? formatZodIssues(error)) : fallback.issues,
    cause: error instanceof Error ? error.cause : undefined
  });
};

/**
 * Normalizes and throws a WorkerError.
 * Supports both pre-defined registry codes and custom error objects.
 * 
 * @param arg - A registered ErrorCodeType string or custom WorkerErrorOptions.
 * @param data - Dynamic context for registry-based error templates.
 * @param cause - The underlying error or reason for the failure.
 * @param extra - Extra information about error like context or issues(zod validation).
 */
export function fail(options: WorkerErrorOptions): never;
export function fail(
  code: ErrorCodeType,
  data: any,
  cause?: unknown,
  extra?: Partial<Pick<WorkerErrorOptions, "context" | "issues">>
): never;

export function fail(
  arg: ErrorCodeType | WorkerErrorOptions,
  data?: any,
  cause?: unknown,
  extra?: Partial<Pick<WorkerErrorOptions, "context" | "issues">>
): never {
  if (typeof arg === "string") {
    const meta =
      ERROR_REGISTRY[arg as ErrorCodeType] ?? ERROR_REGISTRY.UNREGISTERED_ERROR_CODE

    throw new WorkerError({
      code: arg as WorkerErrorCode,
      title: meta.title,
      category: meta.category,
      fatal: meta.fatal,
      retryable: meta.retryable,
      detail: meta.detail(data),
      cause: cause ?? null,
      context: extra?.context ?? null,
      issues: extra?.issues ?? null,
    });
  }

  // If it's not a string, assume it's WorkerErrorOptions
  throw new WorkerError(arg as WorkerErrorOptions);
}