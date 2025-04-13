# Fast Binary Options

A decentralized binary options platform built on Solana, allowing users to bet on price movements of assets with fast settlement and low fees.

## Features

- **Binary Options Trading**: Users can place bets on whether an asset's price will go up or down
- **Fast Settlement**: Trades are settled quickly using on-chain price data
- **Low Fees**: 5% fee on winning trades
- **Decentralized Oracle**: Price data is verified using Ed25519 signatures
- **Secure**: All transactions are verified on-chain
- **User-Friendly**: Simple interface for placing and settling bets

## Technical Critical Points

### 1. Security
- **Signature Verification**: Uses Solana's Ed25519 program for verifying oracle signatures
- **Price Data Integrity**: Price data is hashed using Keccak256 before verification
- **Access Control**: Only authorized oracle can set prices
- **Settlement Protection**: Bets can only be settled once

### 2. Performance
- **Efficient Storage**: Uses PDA accounts for storing user and round data
- **Optimized Calculations**: Reward calculations are done with minimal operations
- **Low Gas Usage**: Efficient account structure and minimal state changes

### 3. Reliability
- **Atomic Operations**: All state changes are atomic
- **Error Handling**: Comprehensive error handling for all operations
- **State Validation**: Multiple checks to ensure valid state transitions

## System Design

### Core Components

1. **Round Account**
   - Stores round-specific data (up/down bets, prices)
   - PDA derived from round ID
   - Contains start and end prices

2. **User Round Account**
   - Tracks user's bets for each round
   - PDA derived from user and round ID
   - Stores bet amounts and settlement status

3. **Admin Account**
   - Manages platform settings
   - Stores oracle authority and fees
   - Controls platform parameters

### Key Operations

1. **Placing a Bet**
   - User transfers funds to admin account
   - Bet amounts recorded in round and user accounts
   - Atomic operation ensures consistency

2. **Setting Prices**
   - Oracle provides signed price data
   - Signature verified using Ed25519 program
   - Prices stored in round account

3. **Settling Bets**
   - Calculate rewards based on price movement
   - Transfer winnings to users
   - Collect fees for platform
   - Mark bets as settled

## Usage Guide

### Prerequisites
- Solana CLI tools installed
- Anchor framework
- Node.js and npm

### Setup
1. Clone the repository
2. Install dependencies:
   ```bash
   yarn install
   ```
3. Build the program:
   ```bash
   anchor build
   ```

### Deployment
1. Configure Anchor.toml with your cluster settings
2. Deploy the program:
   ```bash
   anchor deploy
   ```

### Testing
Run the test suite:
```bash
anchor test
```

### Interacting with the Program

1. **Initialize Admin**
   ```typescript
   await program.methods.initializeAdmin(oracleAuthority)
     .accounts({ user: admin.publicKey })
     .signers([admin])
     .rpc();
   ```

2. **Place a Bet**
   ```typescript
   await program.methods.placeBet(roundId, amount, isUp)
     .accounts({ user: user.publicKey })
     .signers([user])
     .rpc();
   ```

3. **Settle a Bet**
   ```typescript
   await program.methods.settleBet(roundId, startPrice, endPrice, signature)
     .accounts({ user: user.publicKey })
     .signers([user])
     .rpc();
   ```

## License
MIT License 