import * as anchor from "@coral-xyz/anchor";
import { Program, utils, BN } from "@coral-xyz/anchor";
import { FastBinaryOption } from "../target/types/fast_binary_option";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import { expect } from "chai";
import * as ed from "@noble/ed25519";
import { assert } from "chai";

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


  const admin = Keypair.fromSeed(to32B("1"))
  const oracleAuthority = Keypair.fromSeed(to32B("2"))
  const newAdmin = Keypair.fromSeed(to32B("3"))
  const newOracleAuthority = Keypair.fromSeed(to32B("4"))
  const user0 = Keypair.fromSeed(to32B("5"))
  const user1 = Keypair.fromSeed(to32B("6"))
  const user2 = Keypair.fromSeed(to32B("7"))
  const user3 = Keypair.fromSeed(to32B("8"))
  const user4 = Keypair.fromSeed(to32B("9"))
  const user5 = Keypair.fromSeed(to32B("a"))


  const users = [admin, oracleAuthority, newAdmin, newOracleAuthority, user0, user1, user2, user3, user4, user5];

  console.log("admin", admin.publicKey.toBase58())
  console.log("newAdmin", newAdmin.publicKey.toBase58())

  const [adminPDA, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("admin")],
    program.programId
  );


  const airdropSol = async (kp: Keypair) => {
    const sig = await provider.connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction({
      signature: sig,
      ...(await provider.connection.getLatestBlockhash()),
    });
    console.log("airdropSol", kp.publicKey.toBase58())
  };

  before(async () => {
    for (const user of users) {
      await airdropSol(user);
    }


    // const data = await program.account.adminAccount.fetch(adminPDA);
    // console.log("data", data)
    // if (data) {
    //   const tx = await program.methods
    //     .deleteAdmin()
    //     .accountsPartial({
    //       authority: newAdmin.publicKey,
    //       adminAccount: adminPDA,
    //     })
    //     .signers([newAdmin])
    //     .rpc();
    //   console.log("tx", tx)
    // }
  });

  it("initializes admin account", async () => {
    const tx = await program.methods
      .initializeAdmin(oracleAuthority.publicKey)
      .accountsPartial({
        adminAccount: adminPDA,
        user: admin.publicKey,
      })
      .signers([admin])
      .rpc();
    console.log("tx", tx)
    const data = await program.account.adminAccount.fetch(adminPDA);
    expect(data.authority.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(data.oracleAuthority.toBase58()).to.equal(oracleAuthority.publicKey.toBase58());
  });



  it("updates oracle authority", async () => {
    const tx = await program.methods
      .setOracleAuthority(newOracleAuthority.publicKey)
      .accountsPartial({
        adminAccount: adminPDA,
        authority: admin.publicKey,
      })
      .signers([admin])
      .rpc();
    console.log("tx", tx)
    const data = await program.account.adminAccount.fetch(adminPDA);
    expect(data.authority.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(data.oracleAuthority.toBase58()).to.equal(newOracleAuthority.publicKey.toBase58());
  });

  // it("update oracle authority fails", async () => {
  //   const ixs = [
  //     await program.methods.setOracleAuthority(oracleAuthority.publicKey)
  //       .accountsPartial({ adminAccount: adminPDA, authority: newAdmin.publicKey }).signers([newAdmin])
  //       .instruction(),
  //   ]

  //   const tx = new Transaction()
  //   tx.recentBlockhash = svm.latestBlockhash()
  //   tx.add(...ixs)
  //   tx.sign(newAdmin)
  //   const res = svm.sendTransaction(tx) as FailedTransactionMetadata
  //   expect(res.err()).is.not.null

  //   const ata = svm.getAccount(adminPDA)
  //   const data = program.coder.accounts.decode("adminAccount", Buffer.from(ata?.data))
  //   expect(data.authority.equals(admin.publicKey)).to.be.true;
  //   expect(data.oracleAuthority.equals(newOracleAuthority.publicKey)).to.be.true;
  // });

  it("update authority succeeds", async () => {
    const ixs = [
      await program.methods.setAdminAuthority(newAdmin.publicKey)
        .accountsPartial({ adminAccount: adminPDA, authority: admin.publicKey })
        .instruction(),
      await program.methods.setOracleAuthority(oracleAuthority.publicKey)
        .accountsPartial({ adminAccount: adminPDA, authority: newAdmin.publicKey })
        .instruction(),
    ]
    const tx = new Transaction().add(...ixs)
    tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash
    const res = await provider.connection.sendTransaction(tx, [admin, newAdmin])
    await provider.connection.confirmTransaction({
      signature: res,
      ...(await provider.connection.getLatestBlockhash()),
    });
    const data = await program.account.adminAccount.fetch(adminPDA);
    expect(data.authority.toBase58()).to.equal(newAdmin.publicKey.toBase58());
    expect(data.oracleAuthority.toBase58()).to.equal(oracleAuthority.publicKey.toBase58());
  })

  it("bet", async () => {
    const now = Math.floor(Date.now() / 1000);
    const roundId = Math.floor(now / 300) * 300 + 300;
    const betAmount = LAMPORTS_PER_SOL * 0.1
    const roundIdSeed = new BN(roundId).toArrayLike(Buffer, "le", 8)

    const userRoundAccount = PublicKey.findProgramAddressSync(
      [Buffer.from("user"), user0.publicKey.toBuffer(), roundIdSeed],
      program.programId
    )[0];


    const roundAccount = PublicKey.findProgramAddressSync(
      [Buffer.from("round"), roundIdSeed],
      program.programId
    )[0];

    const adminAccount = PublicKey.findProgramAddressSync(
      [Buffer.from("admin")],
      program.programId
    )[0];

    const res = await program.methods
      .placeBet(new BN(roundId), new BN(betAmount), true)
      .accountsPartial({
        user: user0.publicKey,
        userRoundAccount,
        roundAccount,
        adminAccount,
        systemProgram: SystemProgram.programId
      })
      .signers([user0])
      .rpc({ commitment: "confirmed" });

    await provider.connection.confirmTransaction({
      signature: res,
      ...(await provider.connection.getLatestBlockhash()),
    });

    const userRoundAccountData = await program.account.userRoundAccount.fetch(userRoundAccount);
    expect(userRoundAccountData.roundId.toNumber()).to.equal(roundId)
    expect(userRoundAccountData.up.toNumber()).to.equal(betAmount)
    expect(userRoundAccountData.down.toNumber()).to.equal(0)
    expect(userRoundAccountData.settled).to.be.false

    const roundAccountData = await program.account.roundAccount.fetch(roundAccount);
    expect(roundAccountData.roundId.toNumber()).to.equal(roundId)
    expect(roundAccountData.up.toNumber()).to.equal(betAmount)
    expect(roundAccountData.down.toNumber()).to.equal(0)
  })

  it("settle bet", async () => {
    const now = Math.floor(Date.now() / 1000);
    const roundId = Math.floor(now / 300) * 300 + 300;
    const betAmount = LAMPORTS_PER_SOL * 0.1
    const roundIdSeed = new BN(roundId).toArrayLike(Buffer, "le", 8)

    const userRoundAccount = PublicKey.findProgramAddressSync(
      [Buffer.from("user"), user0.publicKey.toBuffer(), roundIdSeed],
      program.programId
    )[0];


    const roundAccount = PublicKey.findProgramAddressSync(
      [Buffer.from("round"), roundIdSeed],
      program.programId
    )[0];

    const adminAccount = PublicKey.findProgramAddressSync(
      [Buffer.from("admin")],
      program.programId
    )[0];

    const placeBetSig = await program.methods
      .placeBet(new BN(roundId), new BN(betAmount), true)
      .accountsPartial({
        user: user0.publicKey,
        userRoundAccount,
        roundAccount,
        adminAccount,
        systemProgram: SystemProgram.programId
      })
      .signers([user0])
      .rpc({ commitment: "confirmed" });

    await provider.connection.confirmTransaction({
      signature: placeBetSig,
      ...(await provider.connection.getLatestBlockhash()),
    });


    const startPrice = new BN(100)
    const endPrice = new BN(200)

    const msg = Buffer.from(`${roundId}:${startPrice.toNumber()}:${endPrice.toNumber()}`)

    const signature = await ed.signAsync(msg, oracleAuthority.secretKey.slice(0, 32))

    let tx = new Transaction()
      .add(
        anchor.web3.Ed25519Program.createInstructionWithPublicKey({
          publicKey: oracleAuthority.publicKey.toBytes(),
          message: msg,
          signature: signature,
        }))
      .add(
        await program.methods
          .settleBet(new BN(roundId), new BN(100), new BN(200), Array.from(signature))
          .accountsPartial({
            user: user0.publicKey,
            userRoundAccount,
            roundAccount,
            adminAccount,
            instructionSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            systemProgram: SystemProgram.programId
          })
          .signers([user0])
          .instruction()
      )

    const { lastValidBlockHeight, blockhash } =
      await provider.connection.getLatestBlockhash();
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.recentBlockhash = blockhash;
    tx.feePayer = user0.publicKey;

    tx.sign(user0);

    const settleBetSig = await provider.connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "confirmed" });

    await provider.connection.confirmTransaction({
      signature: settleBetSig,
      ...(await provider.connection.getLatestBlockhash()),
    });

    const roundAccountData = await program.account.roundAccount.fetch(roundAccount);
    expect(roundAccountData.startPrice.toNumber()).to.equal(startPrice.toNumber());
    expect(roundAccountData.endPrice.toNumber()).to.equal(endPrice.toNumber());
    expect(roundAccountData.up.toNumber()).to.equal(betAmount);
    expect(roundAccountData.down.toNumber()).to.equal(0);


  })
});
