/**
 * Scatter's ABI.
 *
 * Hand-written and `as const` rather than imported from `contracts/out`. The const assertion is
 * what gives viem and wagmi their argument and return types; a generated JSON artifact loses that
 * unless it is cast, and a mistyped argument would then only surface as a revert.
 *
 * The custom errors earn their place: every one of them names the row that caused it, which is
 * what turns "transaction failed" into "row 42 has no address".
 */
export const scatterAbi = [
  {
    type: "function",
    name: "scatter",
    stateMutability: "payable",
    inputs: [
      { name: "recipients", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "scatterEqual",
    stateMutability: "payable",
    inputs: [
      { name: "recipients", type: "address[]" },
      { name: "amountEach", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "totalOf",
    stateMutability: "pure",
    inputs: [{ name: "amounts", type: "uint256[]" }],
    outputs: [{ name: "total", type: "uint256" }],
  },
  {
    type: "function",
    name: "MAX_RECIPIENTS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "Scattered",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "recipientCount", type: "uint256", indexed: false },
      { name: "total", type: "uint256", indexed: false },
    ],
  },
  { type: "error", name: "NoRecipients", inputs: [] },
  {
    type: "error",
    name: "LengthMismatch",
    inputs: [{ name: "recipients", type: "uint256" }, { name: "amounts", type: "uint256" }],
  },
  {
    type: "error",
    name: "TooManyRecipients",
    inputs: [{ name: "count", type: "uint256" }, { name: "max", type: "uint256" }],
  },
  { type: "error", name: "ZeroRecipient", inputs: [{ name: "index", type: "uint256" }] },
  { type: "error", name: "ZeroAmount", inputs: [{ name: "index", type: "uint256" }] },
  {
    type: "error",
    name: "InsufficientValue",
    inputs: [{ name: "sent", type: "uint256" }, { name: "required", type: "uint256" }],
  },
  {
    type: "error",
    name: "TransferFailed",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "index", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "RefundFailed",
    inputs: [{ name: "sender", type: "address" }, { name: "amount", type: "uint256" }],
  },
] as const;
