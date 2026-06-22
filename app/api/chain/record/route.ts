import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { ZG_CONFIG } from "@/lib/zeroG/config";

export async function POST(request: Request) {
  try {
    const { action, data } = await request.json();

    const privateKey = (process.env.NEXT_PUBLIC_DEFAULT_PRIVATE_KEY || "").trim();
    
    // Fallback transaction hash generator
    const generateMockTxHash = () => 
      "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

    if (!privateKey) {
      console.warn("[0G Chain] NEXT_PUBLIC_DEFAULT_PRIVATE_KEY not found. Using simulated tx hash.");
      return NextResponse.json({
        ok: true,
        txHash: generateMockTxHash(),
        simulated: true
      });
    }

    console.log(`[0G Chain] Anchoring action ${action} to 0G Galileo Testnet...`);

    const provider = new ethers.JsonRpcProvider(ZG_CONFIG.rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    // Encode payload as transaction calldata
    const payloadStr = JSON.stringify({ action, data, timestamp: Date.now() });
    const dataHex = ethers.hexlify(ethers.toUtf8Bytes(payloadStr));

    // Send data-anchoring transaction to self
    const tx = await signer.sendTransaction({
      to: signer.address,
      value: 0,
      data: dataHex,
    });

    console.log(`[0G Chain] Tx sent: ${tx.hash}. Awaiting confirmation...`);
    const receipt = await tx.wait();

    console.log(`[0G Chain] Tx confirmed in block ${receipt?.blockNumber}.`);
    return NextResponse.json({
      ok: true,
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      simulated: false
    });

  } catch (error: any) {
    console.error("[0G Chain] Handler exception:", error);
    const mockHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    return NextResponse.json({
      ok: true,
      txHash: mockHash,
      error: error?.message || String(error),
      simulated: true
    });
  }
}
