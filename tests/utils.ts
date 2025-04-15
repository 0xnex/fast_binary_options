import { Program, BN, web3 } from "@coral-xyz/anchor";
import { FastBinaryOption } from "../target/types/fast_binary_option";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL, Transaction, AccountInfo } from "@solana/web3.js";
import * as ed from "@noble/ed25519";


export type AdminAccountData = {
  authority: PublicKey
  oracleAuthority: PublicKey
  fee: BN
}

export type UserRoundAccountData = {
  roundId: BN
  up: BN
  down: BN
  settled: boolean
}

export type RoundAccountData = {
  roundId: BN
  up: BN
  down: BN
  startPrice: BN
  endPrice: BN
}

class FastBinaryOptions {
  public program: Program<FastBinaryOption>;
  public provider: AnchorProvider;

  constructor(program: Program<FastBinaryOption>, provider: AnchorProvider) {
    this.program = program;
    this.provider = provider;
  }

  async airdropSol(kp: Keypair, amount: number) {
    const sig = await this.provider.connection.requestAirdrop(kp.publicKey, amount);
    await this.waitSigConfirmed(sig);
  }

  async waitSigConfirmed(sig: string) {
    await this.provider.connection.confirmTransaction({
      signature: sig,
      ...(await this.provider.connection.getLatestBlockhash()),
    });
  }

  getRoundId(): number {
    return Math.floor(Date.now() / (300 * 1000)) * 300 + 300;
  }

  async initializeAdmin(admin: Keypair, oracleAuthority: Keypair) {
    const [adminPDA] = this.getPDAs(admin, this.getRoundId());
    const sig = await this.program.methods
      .initializeAdmin(oracleAuthority.publicKey)
      .accountsPartial({
        adminAccount: adminPDA,
        user: admin.publicKey,
        systemProgram: SystemProgram.programId
      })
      .signers([admin])
      .rpc();
    await this.waitSigConfirmed(sig);
  }

  async updateOracleAuthority(admin: Keypair, oracleAuthority: Keypair) {
    const [adminPDA] = this.getPDAs(admin, this.getRoundId());
    const sig = await this.program.methods
      .setOracleAuthority(oracleAuthority.publicKey)
      .accountsPartial({
        adminAccount: adminPDA,
        authority: admin.publicKey,
      })
      .signers([admin])
      .rpc();
    await this.waitSigConfirmed(sig);
  }

  async updateAdminAuthority(admin: Keypair, newAdminAuthority: Keypair) {
    const [adminPDA] = this.getPDAs(admin, this.getRoundId());
    const sig = await this.program.methods
      .setAdminAuthority(newAdminAuthority.publicKey)
      .accountsPartial({
        adminAccount: adminPDA,
        authority: admin.publicKey,
      })
      .signers([admin])
      .rpc();
    await this.waitSigConfirmed(sig);
  }


  async placeBet(user: Keypair, roundId: number, amount: BN, isUp: boolean) {
    const [adminAccount, roundAccount, userRoundAccount] = this.getPDAs(user, roundId);
    const sig = await this.program.methods.placeBet(new BN(roundId), amount, isUp)
      .accountsPartial({
        user: user.publicKey,
        userRoundAccount,
        roundAccount,
        adminAccount,
        systemProgram: SystemProgram.programId
      })
      .signers([user])
      .rpc({
        commitment: "confirmed"
      });
    await this.waitSigConfirmed(sig);
  }
  async settleRound(user: Keypair, oracleAuthority: Keypair, roundId: number, startPrice: BN, endPrice: BN) {
    const [adminAccount, roundAccount] = this.getPDAs(user, roundId);

    const msg = Buffer.concat([
      new BN(roundId).toArrayLike(Buffer, "le", 8),
      startPrice.toArrayLike(Buffer, "le", 8),
      endPrice.toArrayLike(Buffer, "le", 8)
    ]);
    const signature = await ed.signAsync(msg, oracleAuthority.secretKey.slice(0, 32));

    const tx = new Transaction()
      .add(
        web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: oracleAuthority.publicKey.toBytes(),
          message: msg,
          signature: signature,
        })
      )
      .add(
        await this.program.methods.settleRound(new BN(roundId), startPrice, endPrice, Array.from(signature))
          .accountsPartial({
            user: user.publicKey,
            roundAccount,
            ixAccount: web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            adminAccount,
            systemProgram: SystemProgram.programId
          })
          .signers([user])
          .instruction()
      );
    const { lastValidBlockHeight, blockhash } = await this.provider.connection.getLatestBlockhash();
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.recentBlockhash = blockhash;
    tx.feePayer = user.publicKey;
    tx.sign(user);
    const sig = await this.provider.connection.sendRawTransaction(tx.serialize(), {
      preflightCommitment: "confirmed"
    });
    await this.waitSigConfirmed(sig);
  }

  async settleBet(user: Keypair, roundId: number) {
    const [adminAccount, roundAccount, userRoundAccount] = this.getPDAs(user, roundId);
    const sig = await this.program.methods.settleBet(new BN(roundId))
      .accountsPartial({
        user: user.publicKey,
        userRoundAccount,
        roundAccount,
        adminAccount,
        systemProgram: SystemProgram.programId
      })
      .signers([user])
      .rpc({
        commitment: "confirmed"
      });
    await this.waitSigConfirmed(sig);
  }

  async withdrawFees(admin: Keypair) {
    const [adminAccount] = this.getPDAs(admin, this.getRoundId());
    const sig = await this.program.methods.withdrawFee()
      .accountsPartial({
        authority: admin.publicKey,
        adminAccount,
        to: admin.publicKey,
        systemProgram: SystemProgram.programId
      })
      .signers([admin])
      .rpc({
        commitment: "confirmed"
      });
    await this.waitSigConfirmed(sig);
  }

  getPDAs(user: Keypair, roundId: number): [PublicKey, PublicKey, PublicKey] {
    const roundIdSeed = new BN(roundId).toArrayLike(Buffer, "le", 8)
    const userRoundAccount = PublicKey.findProgramAddressSync(
      [Buffer.from("user"), user.publicKey.toBuffer(), roundIdSeed],
      this.program.programId
    )[0];
    const roundAccount = PublicKey.findProgramAddressSync(
      [Buffer.from("round"), roundIdSeed],
      this.program.programId
    )[0];
    const adminAccount = PublicKey.findProgramAddressSync(
      [Buffer.from("admin")],
      this.program.programId
    )[0];
    return [adminAccount, roundAccount, userRoundAccount];
  }

  async getPDAData(user: Keypair, roundId: number): Promise<[AdminAccountData, RoundAccountData, UserRoundAccountData]> {
    const [adminAccount, roundAccount, userRoundAccount] = this.getPDAs(user, roundId);
    const adminAccountData = await this.program.account.adminAccount.fetchNullable(adminAccount);
    const roundAccountData = await this.program.account.roundAccount.fetchNullable(roundAccount);
    const userRoundAccountData = await this.program.account.userRoundAccount.fetchNullable(userRoundAccount);
    return [adminAccountData, roundAccountData, userRoundAccountData];
  }
}
export default FastBinaryOptions;

