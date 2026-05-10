import type { WorkerErrorCategory } from "./types";

export type ErrorCodeType = keyof typeof ERROR_REGISTRY;

interface RegistryEntry {
  title: string;
  detail?: (data: any) => string;
  category: WorkerErrorCategory;
  retryable: boolean;
  fatal: boolean;
};

/**
 * Centralized Error Registry
 */
export const ERROR_REGISTRY = {
  UNREGISTERED_ERROR_CODE: {
    title: "Unknown Error",
    detail: (data: { code: string }) => `An unregistered error occurred: ${data.code}`,
    category: "internal",
    retryable: false,
    fatal: true,
  },
  CONFIG_SIGNATURE_MISSING: {
    title: "Missing worker config signature",
    detail: (data: { value: string }) =>
      `Detached config signature ${data.value} is required when config signing is enabled.`,
    category: "configuration",
    retryable: false,
    fatal: true,
  },
  CONFIG_SIGNATURE_INVALID: {
    title: "Invalid worker config signature",
    detail: (data: { value: string }) => `Detached config signature ${data.value} failed verification.`,
    category: "integrity",
    retryable: false,
    fatal: true,
  },
  SECRET_ENV_MISSING: {
    title: "Required secret is missing",
    detail: (data: { keyName: string }) => `${data.keyName} is required.`,
    category: "configuration",
    retryable: false,
    fatal: true,
  },
  SECRET_ENV_INVALID: {
    title: "Invalid secret format",
    detail: (data: { keyName: string, KEY_LENGTH: number }) =>
      `${data.keyName} must resolve to exactly ${data.KEY_LENGTH} bytes. Supported formats: 64-char hex or base64.`,
    category: "configuration",
    retryable: false,
    fatal: true,
  },
} as const satisfies Record<string, RegistryEntry>;

/**
 * Type-safe map for error codes derived from @constant {ERROR_REGISTRY}
 * It standardizes the code without writing it manually every time
 * 
 * @example fail(CODE.CONFIG_SIGNATURE_MISSING, {signature:path});
 */
export const CODE = Object.fromEntries(
  Object.keys(ERROR_REGISTRY).map(k => [k, k])
) as { [k in keyof typeof ERROR_REGISTRY]: k }