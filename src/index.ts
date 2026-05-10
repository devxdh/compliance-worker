import { verifySignatureWorkerConfig } from "@/modules/config";
import { sha256Hex } from "./utils/digest";

async function main() {
  const configPath = new URL("../compliance.worker.yaml", import.meta.url)
  await verifySignatureWorkerConfig(process.env, configPath);
  const file = await Bun.file(configPath).text();
  const workerConfigHash = await sha256Hex(file);
}