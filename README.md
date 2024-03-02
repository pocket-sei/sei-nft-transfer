# sei-nft-transfer

## About

A small, lightweight CLI tool to transfer SEI NFTs. Written in Javascript using the Inquirer package.

## Installation

### Prerequisites

1. Install [node.js](https://nodejs.org/)

### Procedure

1. Clone the repo
    ```
    git clone https://github.com/pocket-sei/sei-nft-transfer.git
    cd sei-nft-transfer
    npm install
    ```
2. Create privatekeys.txt
    ```
    touch privatekeys.txt
    ```
3. Add your private keys to `privatekeys.txt`, one per line with no other text.
4. Run the application
    ```
    node index.js
    ```

## Configuration

If you should need to change any configuration values like the gas used or the RPC endpoint you may do so in `config/default.json`. You may also select a `DEFAULT_RECIPIENT` for the NFT transfers. For example, if you are using this tool to primarily transfer assets from a burner to your main wallet, you would set your main wallet as the `DEFAULT_RECIPIENT` so you wouldn't have to paste the address in every time. You can still use a different address while using the tool, however.
