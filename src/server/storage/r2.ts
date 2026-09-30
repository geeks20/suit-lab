import "server-only";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertSafeKey, type ObjectStorage, type StoredObject } from "./types";

export interface R2Options {
  endpoint: string; // https://<account_id>.r2.cloudflarestorage.com
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  client?: S3Client;
}

/** Cloudflare R2 through its S3-compatible API. The bucket must NOT have public access enabled. */
export class R2Storage implements ObjectStorage {
  readonly kind = "r2" as const;
  private client: S3Client;
  private bucket: string;

  constructor(opts: R2Options) {
    this.bucket = opts.bucket;
    this.client =
      opts.client ??
      new S3Client({
        region: "auto",
        endpoint: opts.endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
      });
  }

  async put(key: string, bytes: Buffer, contentType: string) {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: contentType, CacheControl: "private, max-age=3600" }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    assertSafeKey(key);
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = Buffer.from(await res.Body!.transformToByteArray());
      return { bytes, contentType: res.ContentType ?? "application/octet-stream" };
    } catch (e) {
      if ((e as { name?: string }).name === "NoSuchKey") return null;
      throw e;
    }
  }

  async delete(key: string) {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deletePrefix(prefix: string) {
    if (!prefix.endsWith("/") || prefix.length < 8) throw new Error("Refusing to delete an unsafe prefix");
    let deleted = 0;
    let token: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (keys.length) {
        await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }));
        deleted += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return deleted;
  }

  async signedUrl(key: string, ttlSeconds: number) {
    assertSafeKey(key);
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: ttlSeconds });
  }
}
