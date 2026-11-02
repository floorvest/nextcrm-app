import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage settings are validated lazily, not at module load.
 * `next build` imports every route module while collecting page data, and
 * build machines deliberately do not hold runtime secrets (see the build-time
 * placeholders in the Dockerfile), so throwing here broke production builds.
 * A misconfigured deployment still fails loudly — on first real use.
 */
const REQUIRED_STORAGE_ENV = [
  "MINIO_ENDPOINT",
  "MINIO_ACCESS_KEY",
  "MINIO_SECRET_KEY",
  "MINIO_BUCKET",
] as const;

export function missingStorageEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return REQUIRED_STORAGE_ENV.filter((name) => !env[name]);
}

/** Throws a clear error when storage is unconfigured. Call before touching the bucket. */
export function assertStorageConfigured(): void {
  const missing = missingStorageEnv();
  if (missing.length > 0) {
    throw new Error(`Object storage is not configured: ${missing.join(", ")} is not defined`);
  }
}

/**
 * URL browsers use to reach the bucket. In Docker MINIO_ENDPOINT is an
 * internal hostname (http://minio:9000) that only the app can resolve, so
 * links and presigned URLs must use the public one. MINIO_PUBLIC_ENDPOINT is
 * read at runtime; NEXT_PUBLIC_MINIO_ENDPOINT is kept for older setups.
 */
export function minioPublicEndpoint(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.MINIO_PUBLIC_ENDPOINT ||
    env.NEXT_PUBLIC_MINIO_ENDPOINT ||
    env.MINIO_ENDPOINT ||
    ""
  ).replace(/\/+$/, "");
}

function createClient(endpoint: string | undefined) {
  return new S3Client({
    // Placeholders keep construction side-effect free when the environment is
    // not configured yet (e.g. during `next build`); real values are used at runtime.
    endpoint: endpoint ?? "http://localhost:9000",
    region: "us-east-1", // MinIO requires a region value; actual value doesn't matter
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? "",
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? "",
    },
    forcePathStyle: true, // REQUIRED for MinIO — without this, SDK uses virtual-hosted-style which breaks
  });
}

export const MINIO_BUCKET = process.env.MINIO_BUCKET;
export const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT;
export const MINIO_PUBLIC_URL = minioPublicEndpoint();

/** For server-side reads and writes (internal endpoint). */
export const minioClient = createClient(process.env.MINIO_ENDPOINT);

/**
 * For presigned URLs handed to browsers. A SigV4 signature covers the host,
 * so the URL must be signed for the endpoint the browser will call. Signing
 * makes no network request, so the app never has to reach this endpoint.
 */
export const minioPresignClient =
  MINIO_PUBLIC_URL === process.env.MINIO_ENDPOINT ? minioClient : createClient(MINIO_PUBLIC_URL);

/** Short-lived GET link for a private object. Hand it out only after an access check. */
export function presignGet(key: string, expiresIn = 300): Promise<string> {
  assertStorageConfigured();
  return getSignedUrl(
    minioPresignClient,
    new GetObjectCommand({ Bucket: MINIO_BUCKET, Key: key }),
    { expiresIn },
  );
}
