import { NextResponse } from "next/server";
import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";
import { ZG_CONFIG } from "@/lib/zeroG/config";

export async function POST(request: Request) {
  try {
    const { key, data } = await request.json();

    const privateKey = (process.env.DEFAULT_PRIVATE_KEY || process.env.NEXT_PUBLIC_DEFAULT_PRIVATE_KEY || "").trim();

    if (!privateKey) {
      return NextResponse.json(
        { ok: false, error: "DEFAULT_PRIVATE_KEY is not configured in your .env file. Real 0G Storage uploads require a private key." },
        { status: 400 }
      );
    }

    const provider = new ethers.JsonRpcProvider(ZG_CONFIG.rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    const indexer = new Indexer(ZG_CONFIG.storageIndexer);

    const address = signer.address;

    // Check balance first to provide clear gas error messages
    const balance = await provider.getBalance(address);
    if (balance === 0n) {
      return NextResponse.json(
        { ok: false, error: `Address ${address} has 0 gas on 0G Galileo Testnet. Please fund it at faucet.0g.ai` },
        { status: 400 }
      );
    }

    // Encode text as byte array for MemData
    const dataStr = JSON.stringify({ key, data, timestamp: Date.now() });
    const bytes = Array.from(Buffer.from(dataStr, "utf-8"));
    const file = new MemData(bytes);

    console.log(`[0G Storage] Uploading ${bytes.length} bytes to ${ZG_CONFIG.storageIndexer}...`);

    // Perform upload
    const [res, err] = await indexer.upload(file, ZG_CONFIG.rpcUrl, signer as any);

    if (err) {
      console.error("[0G Storage] Upload error from SDK:", err);
      let errMsg = err.message || String(err);
      if (errMsg.includes("insufficient funds") || errMsg.includes("INSUFFICIENT_FUNDS")) {
        errMsg = `Insufficient funds for storage fee/gas for address ${address}. Fund it at faucet.0g.ai`;
      } else if (errMsg.includes("REPLACEMENT_UNDERPRICED") || errMsg.includes("replacement fee too low") || errMsg.includes("replacement transaction underpriced")) {
        errMsg = `A prior transaction from ${address} is still pending in the mempool. Please wait a few seconds and retry.`;
      }
      return NextResponse.json(
        { ok: false, error: `0G Storage SDK error: ${errMsg}` },
        { status: 500 }
      );
    }

    if (!res) {
      return NextResponse.json(
        { ok: false, error: "0G Storage upload returned an empty result." },
        { status: 500 }
      );
    }

    let rootHash = "";
    let txHash = "";

    if ("rootHash" in res) {
      rootHash = res.rootHash;
      txHash = res.txHash;
    } else {
      rootHash = res.rootHashes[0];
      txHash = res.txHashes[0];
    }

    console.log("[0G Storage] Upload completed successfully. Root hash:", rootHash);
    return NextResponse.json({
      ok: true,
      rootHash,
      txHash,
      simulated: false
    });

  } catch (error: any) {
    console.error("[0G Storage] Handler exception:", error);
    let msg = error?.message || String(error);
    if (msg.includes("insufficient funds") || msg.includes("INSUFFICIENT_FUNDS")) {
      msg = `Insufficient funds for transaction gas. Fund your key at faucet.0g.ai`;
    }
    return NextResponse.json(
      { ok: false, error: `0G Storage exception: ${msg}` },
      { status: 500 }
    );
  }
}
