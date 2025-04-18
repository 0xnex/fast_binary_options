import * as anchor from "@coral-xyz/anchor";
import { Program, utils, BN } from "@coral-xyz/anchor";
import { FastBinaryOption } from "../target/types/fast_binary_option";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL, Transaction, AccountInfo } from "@solana/web3.js";
import { expect } from "chai";
import * as ed from "@noble/ed25519";
import FastBinaryOptions, {loadKeypairFromFile} from "../tests/utils";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
provider.opts.skipPreflight = true;
provider.opts.commitment = "confirmed";
const program = anchor.workspace.FastBinaryOption as Program<FastBinaryOption>;


const admin = loadKeypairFromFile("./keys/deploy-keypair.json");
const oracleAuthority = loadKeypairFromFile("./keys/oracle-keypair.json");
const fb = new FastBinaryOptions(program, provider);


async function main() {
    const sig = await fb.initializeAdmin(
        admin,
        oracleAuthority.publicKey,
    );
    console.log("sig", sig);

    const adminAccount = await fb.getPDAData(admin.publicKey, fb.getRoundId());
    console.log("adminAccount", adminAccount);
}

main();


