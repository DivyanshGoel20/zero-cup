import { NextResponse } from "next/server";
import { Indexer, MemData } from "@0glabs/0g-ts-sdk";
import { ethers } from "ethers";
import { ZG_CONFIG } from "@/lib/zeroG/config";

export async function POST(request: Request) {
  try {
    const { key, data } = await request.json();

    const privateKey = (process.env.NEXT_PUBLIC_DEFAULT_PRIVATE_KEY || "").trim();
    
    // Fallback root hash if private key or node connection fails
    const generateMockRootHash = () => 
      Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

    if (!privateKey) {
      console.warn("[0G Storage] NEXT_PUBLIC_DEFAULT_PRIVATE_KEY not found. Using fallback mock root hash.");
      return NextResponse.json({
        ok: true,
        rootHash: generateMockRootHash(),
        txHash: "0x" + generateMockRootHash(),
        simulated: true
      });
    }

    // Connect to 0G Galileo RPC and Storage Indexer
    const provider = new ethers.JsonRpcProvider(ZG_CONFIG.rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    const indexer = new Indexer(ZG_CONFIG.storageIndexer);

    // Encode text as byte array for MemData
    const dataStr = JSON.stringify({ key, data, timestamp: Date.now() });
    const bytes = Array.from(Buffer.from(dataStr, "utf-8"));
    const file = new MemData(bytes);

    console.log(`[0G Storage] Uploading ${bytes.length} bytes to ${ZG_CONFIG.storageIndexer}...`);

    // Perform upload
    const [res, err] = await indexer.upload(file, ZG_CONFIG.rpcUrl, signer as any);

    if (err) {
      console.error("[0G Storage] Upload error from SDK:", err);
      // Fallback on connection or indexer failures
      return NextResponse.json({
        ok: true,
        rootHash: generateMockRootHash(),
        txHash: "0x" + generateMockRootHash(),
        error: err.message || String(err),
        simulated: true
      });
    }

    console.log("[0G Storage] Upload completed successfully. Root hash:", res.rootHash);
    return NextResponse.json({
      ok: true,
      rootHash: res.rootHash,
      txHash: res.txHash,
      simulated: false
    });

  } catch (error: any) {
    console.error("[0G Storage] Handler exception:", error);
    // Secure fallback to ensure gameplay simulation runs smoothly
    const mockHash = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    return NextResponse.json({
      ok: true,
      rootHash: mockHash,
      txHash: "0x" + mockHash,
      error: error?.message || String(error),
      simulated: true
    });
  }
}
