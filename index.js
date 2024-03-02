import { Buffer } from "node:buffer";
import fs from "node:fs";
import { exit } from "node:process";

import { Secp256k1Wallet } from "@cosmjs/amino";
import { fromBech32 } from "@cosmjs/encoding";
import { GasPrice } from "@cosmjs/stargate";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import chalk from "chalk";
import config from "config";
import inquirer from "inquirer";

const RPC_ENDPOINT = config.get("RPC_ENDPOINT");
const DEFAULT_RECIPIENT = config.get("DEFAULT_RECIPIENT") == "" ? null : config.get("DEFAULT_RECIPIENT");
const GAS_PRICE = config.get("GAS_PRICE");

var client = null;

await transferNftPrompt();

/**
 * Inqurier prompt to transfer one or more NFTs from a collection
 */
async function transferNftPrompt() {
    const questions = [
        {
            type: "list",
            name: "signer",
            message: "Which wallet would you like to use?",
            choices: getWalletAddressesFromFile,
        },
        {
            type: "input",
            name: "collectionAddress",
            message: "What is the collection address?",
            validate: isValidBech32FromAnswers,
        },
        {
            type: "checkbox",
            name: "tokenIds",
            message: "Which tokens would you like to transfer?",
            loop: false,
            choices: getTokenIdsOwnedFromAnswers,
        },
        {
            type: "input",
            name: "recipientAddress",
            message: "What is the recipient address?",
            default: DEFAULT_RECIPIENT,
            validate: isValidBech32FromAnswers,
        },
        {
            type: "confirm",
            name: "confirm",
            message: confirmTransfer,
            default: false,
        },
    ];

    const answers = await inquirer.prompt(questions);
    if (!answers.confirm) {
        console.log(chalk.red("! Transfer canceled. Exiting."));
        exit(0);
    }

    const instructions = [];
    for (const tokenId of answers.tokenIds) {
        instructions.push({
            contractAddress: answers.collectionAddress,
            msg: {
                transfer_nft: {
                    recipient: answers.recipientAddress,
                    token_id: tokenId,
                },
            },
        });
    }
    try {
        console.log(`Transferring token(s) ${answers.tokenIds.join(", ")} to ${answers.recipientAddress}`);
        const tx = await client.executeMultiple(answers.signer.address, instructions, "auto");
        console.log(chalk.green("✓ Transfer successful!"));
        console.log(chalk.green("✓"), "Transaction id:", chalk.cyan(tx.transactionHash));
        console.log(chalk.green("✓"), "Transaction fee:", chalk.cyan(formatSeiCoin(getTransactionFee(tx))));
    } catch (error) {
        console.error(chalk.red("! Transfer failed!"));
        console.error(chalk.red(error.message));
        exit(1);
    }
}

/**
 * Loads the file of private keys and converts them into SEI wallet addresses
 * @returns {string[]} Array of the users wallet addresses
 */
async function getWalletAddressesFromFile() {
    try {
        const data = fs.readFileSync("privatekeys.txt", "utf8");
        const keys = formatPrivateKeys(data.split("\n"));
        if (keys.length == 0) {
            console.error(chalk.red("No keys in key file! Exiting."));
            exit(1);
        }
        return await getAddressesFromPrivateKeys(keys);
    } catch (error) {
        console.error(chalk.red("Missing key file!"));
        console.error("Place private keys (one per line) in a file named privatekeys.txt in the root directory.");
        exit(1);
    }
}

/**
 * Validates whether a supplied address is Bech32.
 * @param {string} address The wallet address to validate
 * @returns {boolean} True if valid Bech32, false otherwise
 */
function isValidBech32(address) {
    try {
        fromBech32(address);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Validates whether a user-entered address is valid Bech32. Returns an
 * error message if not.
 * @param {string} address The Bech32 wallet address to validate
 * @param {object} answers The answers object from the inquirer prompt
 * @returns {boolean|string} Returns true if valid, error message string otherwise
 */
function isValidBech32FromAnswers(address, answers) {
    const isValid = isValidBech32(address);
    if (isValid) return true;
    else return "Address is not valid.";
}

/**
 * Creates a confirmaton message for the NFT transfer prompt
 * @param {object} answers The answers object from the inquirer prompt
 * @returns {string} The confirmation message string
 */
function confirmTransfer(answers) {
    return `Are you sure you would like to transfer tokens ${answers.tokenIds} to address ${answers.recipientAddress}`;
}

/**
 * Retrieves the token ids for a given collection that are owned by a particualar address
 * @param {string} collectionAddress The collection address to fetch the tokens for
 * @param {Secp256k1Wallet} signer The signer/wallet object
 * @returns {string[]} Array of token ids
 */
async function getTokenIdsOwned(collectionAddress, signer) {
    client = await SigningCosmWasmClient.connectWithSigner(RPC_ENDPOINT, signer, {
        gasPrice: GasPrice.fromString(GAS_PRICE),
    });
    const response = await client.queryContractSmart(collectionAddress, { tokens: { owner: signer.address } });
    return response.tokens;
}

/**
 * Takes the inquirer answers object and retrieves the tokens for the specified collection
 * @param {object} answers The answers object from the inquirer prompt
 * @returns {string[]} Array of token ids
 */
async function getTokenIdsOwnedFromAnswers(answers) {
    const tokens = await getTokenIdsOwned(answers.collectionAddress, answers.signer);
    if (tokens.length == 0) {
        console.log("No tokens owned from this collection. Exiting.");
        exit(1);
    }
    return tokens;
}

/**
 * Removes the "0x" from an array of private keys if it is present
 * @param {string[]} keys Array of private keys to format
 * @returns {string[]} Array of formatted private keys
 */
function formatPrivateKeys(keys) {
    const formattedKeys = [];
    for (const key of keys) {
        // skip blank lines
        if (key.trim() == "") continue;
        // remove "0x" from the keys (case-insensitive) and trim whitespace
        formattedKeys.push(key.replace(/0x/i, "").trim());
    }
    return formattedKeys;
}

/**
 * Converts private keys into their associated SEI addresses
 * @param {string[]} privateKeys Array of private keys to convert
 * @returns {string[]} Array of SEI addresses
 */
async function getAddressesFromPrivateKeys(privateKeys) {
    const addresses = [];
    for (const key of privateKeys) {
        const signer = await Secp256k1Wallet.fromKey(Buffer.from(key, "hex"), "sei");
        const [account] = await signer.getAccounts();
        addresses.push({ name: account.address, value: signer });
    }
    return addresses;
}

/**
 * Formats a SEI coin string into something more readable.
 * @param {string} coin String representation of the SEI amount. Ex. "4396usei"
 * @returns {string} Formatted string of SEI amount. Ex. "0.004396 SEI."
 */
function formatSeiCoin(coin) {
    return `${Number(coin.replace("usei", "")) / 1000000} SEI`;
}

/**
 * Retrieves the fee amount from a transaction object
 * @param {object} tx The transaction object to fetch the fee for
 * @returns {string} The transaction fee amount in SEI
 */
function getTransactionFee(tx) {
    for (const event of tx.events) {
        if (event.type == "tx" && event.hasOwnProperty("attributes")) {
            for (const att of event.attributes) {
                if (att.key == "fee") return att.value;
            }
        }
    }
}
