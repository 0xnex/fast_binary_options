import * as anchor from "@coral-xyz/anchor";
import { Program, utils } from "@coral-xyz/anchor";
import { FastBinaryOption } from "../target/types/fast_binary_option";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import { expect } from "chai";
import { FailedTransactionMetadata, LiteSVM } from "litesvm";


function to32B(seed: string): Uint8Array {
  let seedBytes = utils.bytes.bs58.decode(seed);
  if (seedBytes.length < 32) {
    seedBytes = Buffer.concat([seedBytes, Buffer.alloc(32 - seedBytes.length)]);
  }
  return seedBytes;
}

describe("fast_binary_option", () => {
  const svm = new LiteSVM();

  const program = anchor.workspace.FastBinaryOption as Program<FastBinaryOption>;


  const admin = Keypair.fromSeed(to32B("1"))
  console.log(admin.publicKey.toBase58())
  const oracleAuthority = Keypair.fromSeed(to32B("2"))
  console.log(oracleAuthority.publicKey.toBase58())
  const newAdmin = Keypair.fromSeed(to32B("3"))
  console.log(newAdmin.publicKey.toBase58())
  const newOracleAuthority = Keypair.fromSeed(to32B("4"))
  console.log(newOracleAuthority.publicKey.toBase58())


  const users = [admin, oracleAuthority, newAdmin, newOracleAuthority];

  const [adminPDA, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("admin")],
    program.programId
  );

  console.log(adminPDA.toBase58())

  const airdropSol = async (kp: Keypair) => {
    svm.airdrop(kp.publicKey, BigInt(LAMPORTS_PER_SOL));
  };

  before(async () => {
    for (const user of users) {
      await airdropSol(user);
    }

    svm.addProgramFromFile(program.programId, "./target/deploy/fast_binary_options.so");


    const info = svm.getAccount(adminPDA);

    if (info && info.data) {

      const ixs = [
        await program.methods.deleteAdmin().accounts({
          adminAccount: adminPDA,
        }).signers([admin]).instruction(),
      ]

      const tx = new Transaction()
      tx.recentBlockhash = svm.latestBlockhash()
      tx.add(...ixs)
      tx.sign(admin)
      svm.sendTransaction(tx)

    }
  });

  it("initializes admin account", async () => {

    const ixs = [
      await program.methods.initializeAdmin(oracleAuthority.publicKey)
        .accounts({
          user: admin.publicKey,
        })
        .signers([admin])
        .instruction(),
    ]

    const tx = new Transaction()
    tx.recentBlockhash = svm.latestBlockhash()
    tx.add(...ixs)
    tx.sign(admin)
    svm.sendTransaction(tx)

    const ata = svm.getAccount(adminPDA)
    const data = program.coder.accounts.decode("adminAccount", Buffer.from(ata?.data))

    expect(data.authority.equals(admin.publicKey)).to.be.true;
    expect(data.oracleAuthority.equals(oracleAuthority.publicKey)).to.be.true;
    const fee = data.fee as anchor.BN;
    expect(fee.toNumber()).to.equal(0);
  });

  it("updates oracle authority", async () => {
    const ixs = [
      await program.methods.setOracleAuthority(newOracleAuthority.publicKey)
        .accountsPartial({ adminAccount: adminPDA, authority: admin.publicKey }).signers([admin])
        .instruction(),
    ]

    const tx = new Transaction()
    tx.recentBlockhash = svm.latestBlockhash()
    tx.add(...ixs)
    tx.sign(admin)
    svm.sendTransaction(tx)


    const ata = svm.getAccount(adminPDA)
    const data = program.coder.accounts.decode("adminAccount", Buffer.from(ata?.data))
    expect(data.authority.equals(admin.publicKey)).to.be.true;
    expect(data.oracleAuthority.equals(newOracleAuthority.publicKey)).to.be.true;
  });

  it("update oracle authority fails", async () => {
    const ixs = [
      await program.methods.setOracleAuthority(oracleAuthority.publicKey)
        .accountsPartial({ adminAccount: adminPDA, authority: newAdmin.publicKey }).signers([newAdmin])
        .instruction(),
    ]

    const tx = new Transaction()
    tx.recentBlockhash = svm.latestBlockhash()
    tx.add(...ixs)
    tx.sign(newAdmin)
    const res = svm.sendTransaction(tx) as FailedTransactionMetadata
    expect(res.err()).is.not.null

    const ata = svm.getAccount(adminPDA)
    const data = program.coder.accounts.decode("adminAccount", Buffer.from(ata?.data))
    expect(data.authority.equals(admin.publicKey)).to.be.true;
    expect(data.oracleAuthority.equals(newOracleAuthority.publicKey)).to.be.true;
  });

  it("update authority succeeds", async () => {
    const ixs = [
      await program.methods.setAdminAuthority(newAdmin.publicKey)
        .accountsPartial({ adminAccount: adminPDA, authority: admin.publicKey })
        .signers([admin])
        .instruction(),
      await program.methods.setOracleAuthority(oracleAuthority.publicKey)
        .accountsPartial({ adminAccount: adminPDA, authority: newAdmin.publicKey })
        .signers([newAdmin])
        .instruction(),
    ]

    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash()
    tx.add(...ixs)
    tx.sign(admin, newAdmin)
    svm.sendTransaction(tx)

    const ata = svm.getAccount(adminPDA)
    const data = program.coder.accounts.decode("adminAccount", Buffer.from(ata?.data))
    expect(data.authority.equals(newAdmin.publicKey)).to.be.true;
    expect(data.oracleAuthority.equals(oracleAuthority.publicKey)).to.be.true;
  })

  it("creates user account", async () => {
    const ixs = [
      await program.methods.createUserAccount()
        .accounts({ user: admin.publicKey })
        .signers([admin])
        .instruction(),
    ]
  })
});
