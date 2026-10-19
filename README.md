# Scatter

Pay hundreds of addresses in a single transaction.

**The one transaction:** `scatter(address[] recipients, uint256[] amounts)`

### Bohr testnet (968) — live

| | |
|---|---|
| Contract | [`0xAb246cd1EbD9aCcFba2279EB9eC60c507DdB2890`](https://scan.bohr.life/address/0xAb246cd1EbD9aCcFba2279EB9eC60c507DdB2890) · source verified |
| Deploy block | 27061832 |

### BOT Chain mainnet (677) — live

| | |
|---|---|
| Contract | [`0xAb246cd1EbD9aCcFba2279EB9eC60c507DdB2890`](https://scan.botchain.ai/address/0xAb246cd1EbD9aCcFba2279EB9eC60c507DdB2890) · source verified |
| Deploy block | 27267165 |

The site targets mainnet. The Bohr deployment above stays up and stays documented, so the
contract can still be exercised somewhere mistakes are free.

---

## All or nothing

If any recipient refuses payment the whole transaction reverts and nobody is paid. The alternative
— skip the failures, pay the rest — leaves you believing a payroll ran when part of it did not,
with the only record in a log nobody reads.

The contract **never holds a balance between transactions** and has no `receive()`, so BOT cannot
be parked in it by accident and stranded. Every check is against `msg.value`, never the contract
balance: that is the entire reentrancy defence, and there is a test that attempts the drain it
prevents.

Payments use `call`, not `transfer`. The 2300-gas stipend fails for any smart account, which on a
chain courting agent wallets is most of the interesting ones.

**Measured:** 100 recipients costs 3,551,032 gas — about 35,510 each, most of which is the
unavoidable 9,000 for funding an untouched account. 22 tests.

## Development

```bash
npm install
npm run chain:check          # both BOT Chain networks: ID, head age, gas price
npm test                     # unit tests and the render-loop lint rule
npm run test:integration     # the ABI against the real contract on anvil, where present
npm run dev

cd contracts && forge test -vv
```

## Deploying

Put `DEPLOYER_PRIVATE_KEY` in `.env` (gitignored, `0x` prefix optional), then:

```bash
cd contracts
./deploy.sh bohr --dry     # simulate, broadcast nothing
./deploy.sh bohr           # testnet
./deploy.sh botchain       # mainnet — real BOT, no faucet
```

The wrapper asks the node what chain it is on and refuses to broadcast if it disagrees with the
network named — the one mistake here that cannot be undone. It then verifies the source on the
explorer, reading the contract's name from the broadcast log rather than guessing it from a
filename.

## Built from the template

`../template`, extracted from `ST-Frontier/ghost-pay`. See `../TEMPLATE.md`.
