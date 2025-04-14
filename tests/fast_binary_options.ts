import * as anchor from "@coral-xyz/anchor";
import { Program, utils, BN } from "@coral-xyz/anchor";
import { FastBinaryOption } from "../target/types/fast_binary_option";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL, Transaction, AccountInfo } from "@solana/web3.js";
import { expect } from "chai";
import * as ed from "@noble/ed25519";
import FastBinaryOptions from "./utils";
function to32B(seed: string): Uint8Array {
  let seedBytes = utils.bytes.bs58.decode(seed);
  if (seedBytes.length < 32) {
    seedBytes = Buffer.concat([seedBytes, Buffer.alloc(32 - seedBytes.length)]);
  }
  return seedBytes;
}

describe("fast_binary_option", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.local();
  provider.opts.skipPreflight = true;
  // processed failed tx do not result in AnchorErrors in the client
  // because we cannot get logs for them (only through overkill `onLogs`)
  provider.opts.commitment = "confirmed";
  anchor.setProvider(provider);
  const program = anchor.workspace.FastBinaryOption as Program<FastBinaryOption>;

  const fb = new FastBinaryOptions(program, provider);


  const admin = Keypair.fromSeed(to32B("1"))
  const oracleAuthority = Keypair.fromSeed(to32B("2"))
  const newAdmin = Keypair.fromSeed(to32B("3"))
  const newOracleAuthority = Keypair.fromSeed(to32B("4"))
  const user0 = Keypair.fromSeed(to32B("5"))
  const user1 = Keypair.fromSeed(to32B("6"))
  // const user2 = Keypair.fromSeed(to32B("7"))
  // const user3 = Keypair.fromSeed(to32B("8"))
  // const user4 = Keypair.fromSeed(to32B("9"))
  // const user5 = Keypair.fromSeed(to32B("a"))

  const users = [admin, oracleAuthority, newAdmin, newOracleAuthority, user0, user1,];

  before(async () => {
    const amount = 5 * LAMPORTS_PER_SOL
    for (const user of users) {
      await fb.airdropSol(user, amount);
      console.log(`Airdropped 5 SOL to ${user.publicKey.toBase58()}`);
    }
  });

  it("initializes admin account", async () => {
    await fb.initializeAdmin(admin, oracleAuthority);
    const [data] = await fb.getPDAData(admin, fb.getRoundId());
    expect(data.authority.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(data.oracleAuthority.toBase58()).to.equal(oracleAuthority.publicKey.toBase58());
  });


  it("updates oracle authority", async () => {
    await fb.updateOracleAuthority(admin, newOracleAuthority);
    const [data] = await fb.getPDAData(admin, fb.getRoundId());
    expect(data.oracleAuthority.toBase58()).to.equal(newOracleAuthority.publicKey.toBase58());
  });

  it("updates authority", async () => {
    await fb.updateAdminAuthority(admin, newAdmin);
    const [data] = await fb.getPDAData(admin, fb.getRoundId());
    expect(data.authority.toBase58()).to.equal(newAdmin.publicKey.toBase58());
  });

  it("update oracle and authority fails", async () => {
    try {
      await fb.updateOracleAuthority(admin, newOracleAuthority);
      expect.fail("Should have failed");
    } catch (e) {
      expect(e).not.null
    }

    try {
      await fb.updateAdminAuthority(admin, newAdmin);
      expect.fail("Should have failed");
    } catch (e) {
      expect(e).not.null
    }

    const [adminAccountData] = await fb.getPDAData(admin, fb.getRoundId());
    expect(adminAccountData.authority.toBase58()).to.equal(newAdmin.publicKey.toBase58());
    expect(adminAccountData.oracleAuthority.toBase58()).to.equal(newOracleAuthority.publicKey.toBase58());
  })

  it("bet", async () => {
    const roundId = fb.getRoundId();
    const amount = LAMPORTS_PER_SOL * 0.1
    const fee = amount * 0.05
    const bet = amount - fee

    await fb.placeBet(user0, roundId, new BN(amount), true);
    const [adminAccountData, roundAccountData, userRoundAccountData] = await fb.getPDAData(user0, roundId);
    expect(userRoundAccountData.roundId.toNumber()).to.equal(roundId)
    expect(userRoundAccountData.up.toNumber()).to.equal(bet)
    expect(userRoundAccountData.down.toNumber()).to.equal(0)
    expect(userRoundAccountData.settled).to.be.false

    expect(roundAccountData.roundId.toNumber()).to.equal(roundId)
    expect(roundAccountData.up.toNumber()).to.equal(bet)
    expect(roundAccountData.down.toNumber()).to.equal(0)

    expect(adminAccountData.fee.toNumber()).to.equal(fee)
  })

  it("settle round", async () => {
    const roundId = fb.getRoundId();
    const startPrice = new BN(100)
    const endPrice = new BN(200)

    await fb.settleRound(user0, newOracleAuthority, roundId, startPrice, endPrice);

    const [, roundAccountData,] = await fb.getPDAData(user0, roundId);
    expect(roundAccountData.startPrice.toNumber()).to.equal(startPrice.toNumber())
    expect(roundAccountData.endPrice.toNumber()).to.equal(endPrice.toNumber())
  })

  it("fails to place bet with zero amount", async () => {
    const roundId = fb.getRoundId();

    try {
      await fb.placeBet(user0, roundId, new BN(0), true);
      expect.fail("Should have failed");
    } catch (e) {
      expect(e).to.not.be.null;
    }
  });

  it("fails to place bet with insufficient balance", async () => {
    const roundId = fb.getRoundId();

    try {
      await fb.placeBet(user0, roundId, new BN(LAMPORTS_PER_SOL * 1000), true);
      expect.fail("Should have failed");
    } catch (e) {
      expect(e).to.not.be.null;
    }
  });

  it("fails to settle already settled round", async () => {
    const roundId = fb.getRoundId() + 100000;
    const startPrice = new BN(100);
    const endPrice = new BN(200);

    const betAmount = LAMPORTS_PER_SOL * 0.1;
    await fb.placeBet(user0, roundId, new BN(betAmount), true);
    await fb.settleRound(user0, newOracleAuthority, roundId, startPrice, endPrice);

    try {
      await fb.settleRound(user0, newOracleAuthority, roundId, startPrice, endPrice);
      expect.fail('should have failed')
    } catch (e) {
      expect(e).to.not.be.null;
    }
  });

  it("withdraws fees as admin", async () => {
    const roundId = fb.getRoundId();
    const [adminAccount] = fb.getPDAs(user0, roundId);
    const betAmount = LAMPORTS_PER_SOL * 0.1;
    await fb.placeBet(user0, roundId, new BN(betAmount), true);
    const [adminAccountData0] = await fb.getPDAData(user0, roundId)
    const initialAdminBalance = await provider.connection.getBalance(newAdmin.publicKey);
    const initialAdminAccountBalance = await provider.connection.getBalance(adminAccount);

    const expectedFee = adminAccountData0.fee.toNumber()
    console.log("Initial admin balance:", initialAdminBalance);
    console.log("Initial admin account balance:", initialAdminAccountBalance);
    console.log("Initial fee:", expectedFee)

    // Withdraw fees
    await fb.withdrawFees(newAdmin);


    // Verify balances
    const finalAdminBalance = await provider.connection.getBalance(newAdmin.publicKey);
    const finalAdminAccountBalance = await provider.connection.getBalance(adminAccount);

    console.log("Final admin balance:", finalAdminBalance);
    console.log("Final admin account balance:", finalAdminAccountBalance);

    // Calculate expected fee (5% of bet amount)

    console.log("Expected fee:", expectedFee);
    console.log("Balance difference:", finalAdminBalance - initialAdminBalance);

    expect(finalAdminBalance - initialAdminBalance).to.equal(expectedFee);
    expect(initialAdminAccountBalance - finalAdminAccountBalance).to.equal(expectedFee);
    const [adminAccountData1] = await fb.getPDAData(user0, roundId)
    expect(adminAccountData1.fee.toNumber()).to.eq(0)
  });

  it("fails to withdraw fees as non-admin", async () => {
    const roundId = fb.getRoundId();
    await fb.placeBet(user0, roundId, new BN(LAMPORTS_PER_SOL * 0.1), true);

    try {
      await fb.withdrawFees(user0);
      expect.fail("Should have failed");
    } catch (e) {
      expect(e).to.not.be.null;
    }
  });

  it("verifies user rewards and fees", async () => {
    const roundId = fb.getRoundId() + 7000;
    const betAmount = LAMPORTS_PER_SOL * 0.1;
    const fee = betAmount * 0.05;
    const actualBetAmount = betAmount - fee;

    const [adminAccount] = fb.getPDAs(user0, roundId);

    // Place bet
    await fb.placeBet(user0, roundId, new BN(betAmount), true);

    // Settle round with price going up
    await fb.settleRound(user0, newOracleAuthority, roundId, new BN(100), new BN(200));

    // Get initial balances
    const initialUserBalance = await provider.connection.getBalance(user0.publicKey);
    const initialAdminBalance = await provider.connection.getBalance(adminAccount);

    // Settle bet
    await fb.settleBet(user0, roundId);

    // Get final balances
    const finalUserBalance = await provider.connection.getBalance(user0.publicKey);
    const finalAdminBalance = await provider.connection.getBalance(adminAccount);

    // Calculate expected reward
    // reward = user's winning bet * total bets / total winning bets
    const totalBets = actualBetAmount; // Only one bet in this round
    const winningBets = actualBetAmount; // All bets are winning in this case
    const expectedReward = actualBetAmount * totalBets / winningBets;

    // Verify balances
    const userBalanceChange = new BN(finalUserBalance - initialUserBalance);
    const adminBalanceChange = new BN(finalAdminBalance - initialAdminBalance);

    console.log("User balance change:", userBalanceChange);
    console.log("Expected reward:", expectedReward);
    console.log("Admin balance change:", adminBalanceChange);
    console.log("Expected fee:", fee);

    // User should receive the reward
    expect(userBalanceChange).to.equal(expectedReward);
    // Admin should have the fee
    expect(adminBalanceChange).to.equal(fee);
  });

  it("verifies user rewards when price goes down", async () => {
    const roundId = fb.getRoundId();
    const betAmount = LAMPORTS_PER_SOL * 0.1;
    const fee = betAmount * 0.05;
    const actualBetAmount = betAmount - fee;

    await fb.placeBet(user0, roundId, new BN(betAmount), false);
    await fb.settleRound(user0, oracleAuthority, roundId, new BN(200), new BN(100));

    const [adminAccount] = fb.getPDAs(user0, roundId);

    // Get initial balances
    const initialUserBalance = await provider.connection.getBalance(user0.publicKey);
    const initialAdminBalance = await provider.connection.getBalance(adminAccount);

    // Settle bet
    await fb.settleBet(user0, roundId);

    // Get final balances
    const finalUserBalance = await provider.connection.getBalance(user0.publicKey);
    const finalAdminBalance = await provider.connection.getBalance(adminAccount);

    // Calculate expected reward
    // reward = user's winning bet * total bets / total winning bets
    const totalBets = actualBetAmount; // Only one bet in this round
    const winningBets = actualBetAmount; // All bets are winning in this case
    const expectedReward = actualBetAmount * totalBets / winningBets;

    // Verify balances
    const userBalanceChange = finalUserBalance - initialUserBalance
    const adminBalanceChange = finalAdminBalance - initialAdminBalance


    console.log("User balance change:", userBalanceChange.toString());
    console.log("Expected reward:", expectedReward.toString());
    console.log("Admin balance change:", adminBalanceChange.toString());
    console.log("Expected fee:", fee.toString());

    // User should receive the reward
    expect(userBalanceChange).to.be.eq(expectedReward);
    // Admin should have the fee
    expect(adminBalanceChange).to.be.eq(fee);
  });

  it("verifies multiple users rewards", async () => {
    const roundId = fb.getRoundId();
    const betAmount1 = LAMPORTS_PER_SOL * 0.1;
    const betAmount2 = LAMPORTS_PER_SOL * 0.2;
    const fee1 = betAmount1 * 0.05;
    const fee2 = betAmount2 * 0.05;
    const actualBetAmount1 = betAmount1 - fee1;
    const actualBetAmount2 = betAmount2 - fee2;

    const [adminAccount] = fb.getPDAs(user0, roundId);

    // Place bets
    await fb.placeBet(user0, roundId, new BN(betAmount1), true);
    await fb.placeBet(user1, roundId, new BN(betAmount2), true);

    // Get initial balances
    const initialUser1Balance = await provider.connection.getBalance(user0.publicKey);
    const initialUser2Balance = await provider.connection.getBalance(user1.publicKey);
    const initialAdminBalance = await provider.connection.getBalance(adminAccount);

    await fb.settleRound(user0, oracleAuthority, roundId, new BN(100), new BN(200));

    await fb.settleBet(user0, roundId);
    await fb.settleBet(user1, roundId);

    // Get final balances
    const finalUser1Balance = await provider.connection.getBalance(user0.publicKey);
    const finalUser2Balance = await provider.connection.getBalance(user1.publicKey);
    const finalAdminBalance = await provider.connection.getBalance(adminAccount);

    // Calculate expected rewards
    const totalBets = actualBetAmount1 + actualBetAmount2;
    const winningBets = totalBets; // All bets are winning in this case
    const expectedReward1 = actualBetAmount1 * totalBets / winningBets;
    const expectedReward2 = actualBetAmount2 * totalBets / winningBets;

    // Verify balances
    const user1BalanceChange = finalUser1Balance - initialUser1Balance;
    const user2BalanceChange = finalUser2Balance - initialUser2Balance;
    const adminBalanceChange = finalAdminBalance - initialAdminBalance;

    console.log("User1 balance change:", user1BalanceChange.toString());
    console.log("Expected reward1:", expectedReward1.toString());
    console.log("User2 balance change:", user2BalanceChange.toString());
    console.log("Expected reward2:", expectedReward2.toString());
    console.log("Admin balance change:", adminBalanceChange.toString());
    console.log("Expected total fee:", fee1 + fee2);

    // Users should receive their respective rewards
    expect(user1BalanceChange).to.be.eq(expectedReward1);
    expect(user2BalanceChange).to.be.eq(expectedReward2);
    // Admin should have the total fees
    expect(adminBalanceChange).to.be.eq(fee1 + fee2);
  });
});
