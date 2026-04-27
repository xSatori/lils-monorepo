# Rounds Contract Deployment

The Rounds contracts can deploy to Sepolia for testing or Ethereum mainnet for production. The factory constructor requires the active chain ID so a deployment cannot accidentally land on the wrong network.

## Required Environment

Save local deployment values in the repo root `.env` file:

```text
C:\Users\Deej\Documents\GitHub\lils-monorepo\.env
```

Do not commit private keys.

```dotenv
DEPLOYER_PRIVATE_KEY=0x...
SEPOLIA_RPC_URL=https://...
MAINNET_RPC_URL=https://...
ETHERSCAN_API_KEY=...
ROUNDS_GLOBAL_ADMIN=0x...
ROUNDS_FEE_RECIPIENT=0xd5f279ff9eb21c6d40c8f345a66f2751c4eea1fb
ROUNDS_REQUIRED_CHAIN_ID=11155111
```

Use `ROUNDS_REQUIRED_CHAIN_ID=11155111` for Sepolia and `ROUNDS_REQUIRED_CHAIN_ID=1` for Ethereum mainnet.

## Install Foundry

If `forge` is not installed, install Foundry first:

```powershell
irm https://foundry.paradigm.xyz | iex
foundryup
forge --version
```

## Test

```powershell
forge test
```

## Deploy to Sepolia

```powershell
$env:ROUNDS_REQUIRED_CHAIN_ID="11155111"
forge script contracts/script/DeployRounds.s.sol:DeployRounds --rpc-url $env:SEPOLIA_RPC_URL --broadcast --verify --etherscan-api-key $env:ETHERSCAN_API_KEY
```

## Deploy to Mainnet

```powershell
$env:ROUNDS_REQUIRED_CHAIN_ID="1"
forge script contracts/script/DeployRounds.s.sol:DeployRounds --rpc-url $env:MAINNET_RPC_URL --broadcast --verify --etherscan-api-key $env:ETHERSCAN_API_KEY
```

## Post Deploy

1. Record the `RoundsFactory` and `RoundsRound implementation` addresses from the script output.
2. Update `apps/web/src/data/rounds/onchain.ts` with the deployed factory address for the target chain.
3. Allow any ERC-20 prize token before creators use it:

```powershell
cast send <ROUNDS_FACTORY_ADDRESS> "setPrizeTokenAllowed(address,bool)" <TOKEN_ADDRESS> true --rpc-url $env:SEPOLIA_RPC_URL --private-key $env:DEPLOYER_PRIVATE_KEY
```

ETH prizes do not need allowlisting. The deployer wallet must have enough ETH for gas and, during round creation, the flat 0.01 ETH Lil Nouns fee plus any ETH prize amount.
