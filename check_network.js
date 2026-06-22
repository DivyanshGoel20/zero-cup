const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("=== 0G Network Diagnostic Tool ===");

  // 1. Load private key from .env
  let privateKey = "";
  try {
    const envPath = path.join(__dirname, ".env");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      const lines = envContent.split("\n");
      for (const line of lines) {
        if (line.trim().startsWith("NEXT_PUBLIC_DEFAULT_PRIVATE_KEY=")) {
          privateKey = line.split("=")[1].trim();
        }
      }
    }
  } catch (err) {
    console.error("Failed to read .env file:", err.message);
  }

  if (!privateKey) {
    console.error("Error: NEXT_PUBLIC_DEFAULT_PRIVATE_KEY not found in .env");
    return;
  }

  // Format private key
  if (!privateKey.startsWith("0x")) {
    privateKey = "0x" + privateKey;
  }

  const rpcUrl = "https://evmrpc-testnet.0g.ai";
  console.log("Connecting to RPC:", rpcUrl);
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  try {
    // 2. Fetch Network
    const network = await provider.getNetwork();
    console.log("Connected Network Chain ID:", network.chainId.toString());

    // 3. Setup Signer
    const signer = new ethers.Wallet(privateKey, provider);
    console.log("Derived Wallet Address:", signer.address);

    // 4. Fetch Balance
    const balance = await provider.getBalance(signer.address);
    console.log("Wallet Balance in wei:", balance.toString());
    console.log("Wallet Balance in A0GI:", ethers.formatEther(balance));

    // 5. Fetch Nonce (Tx Count)
    const nonce = await provider.getTransactionCount(signer.address);
    console.log("Next Transaction Nonce:", nonce);

    // 6. Fetch Gas Price
    const feeData = await provider.getFeeData();
    console.log("Gas Price (suggested):", feeData.gasPrice ? feeData.gasPrice.toString() + " wei" : "N/A");

    // 7. Simulate simple self-transfer
    console.log("Simulating simple transfer...");
    try {
      const gasEst = await provider.estimateGas({
        from: signer.address,
        to: signer.address,
        value: 0,
      });
      console.log("Estimated gas for transfer:", gasEst.toString());
    } catch (err) {
      console.error("Simulated transfer failed:", err.message);
    }

    // 8. Test Flow contract
    const flowAddress = "0x22E03a6A89B950F1c82ec5e74F8eCa321a105296";
    console.log("Checking Flow contract at:", flowAddress);
    const code = await provider.getCode(flowAddress);
    if (code === "0x") {
      console.error("Error: No contract code at Flow contract address on this chain!");
    } else {
      console.log("Contract code verified (length):", code.length);
    }

  } catch (err) {
    console.error("Diagnostic execution error:", err.message);
  }
}

main().catch(console.error);
