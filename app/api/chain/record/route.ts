import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { ZG_CONFIG } from "@/lib/zeroG/config";

export async function POST(request: Request) {
  try {
    const { action, data } = await request.json();

    const privateKey = (process.env.DEFAULT_PRIVATE_KEY || process.env.NEXT_PUBLIC_DEFAULT_PRIVATE_KEY || "").trim();

    if (!privateKey) {
      return NextResponse.json(
        { ok: false, error: "DEFAULT_PRIVATE_KEY is not configured in your .env file. Real 0G Chain records require a private key." },
        { status: 400 }
      );
    }

    const provider = new ethers.JsonRpcProvider(ZG_CONFIG.rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    const address = signer.address;

    // Check balance first
    const balance = await provider.getBalance(address);
    if (balance === 0n) {
      return NextResponse.json(
        { ok: false, error: `Address ${address} has 0 gas on 0G Galileo Testnet. Please fund it at faucet.0g.ai` },
        { status: 400 }
      );
    }

    console.log(`[0G Chain] Anchoring action ${action} to 0G Galileo Testnet...`);

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
    let msg = error?.message || String(error);
    if (msg.includes("insufficient funds") || msg.includes("INSUFFICIENT_FUNDS")) {
      msg = `Insufficient funds/gas for transaction. Please fund your key at faucet.0g.ai`;
    }
    return NextResponse.json(
      { ok: false, error: `0G Chain error: ${msg}` },
      { status: 500 }
    );
  }
}
