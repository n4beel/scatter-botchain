"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BaseError, ContractFunctionRevertedError, formatEther, type Address, type Hex } from "viem";
import { useAccount, useBalance, useChainId, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import TxStatus, { type TxStage } from "@/components/ui/TxStatus";
import { useToast } from "@/components/ui/Toast";
import { activeBotChain, isBotChainId } from "@/lib/botchain/chain";
import { formatNativeAmount } from "@/lib/botchain/amount";
import { getDeployment } from "@/lib/botchain/deployment";
import { scatterAbi } from "@/lib/botchain/abi";
import { equalAmount, isSendable, parseList, MAX_RECIPIENTS } from "@/lib/recipients";

const EXAMPLE = `0x1111111111111111111111111111111111111111, 0.5
0x2222222222222222222222222222222222222222, 0.25
# comments and blank lines are ignored`;

/**
 * Paste a list, check it, send it.
 *
 * Everything is shown before the signature: every row, the total, and the balance after. A batch
 * payment is the kind of transaction where the mistake is noticed afterwards, so there is no step
 * where the user is asked to trust a number they have not seen.
 */
export default function ScatterForm() {
  const chainId = useChainId();
  const { address } = useAccount();
  const { toast } = useToast();
  const { writeContractAsync } = useWriteContract();
  const { data: balance } = useBalance({ address, query: { enabled: Boolean(address) } });

  const [input, setInput] = useState("");
  const [stage, setStage] = useState<TxStage>("idle");
  const [hash, setHash] = useState<Hex | null>(null);

  const deployment = isBotChainId(chainId) ? getDeployment(chainId) : null;
  const list = useMemo(() => parseList(input), [input]);
  const sendable = isSendable(list);
  const uniform = useMemo(() => equalAmount(list.rows), [list.rows]);

  const insufficient = balance !== undefined && sendable && list.total > balance.value;

  const receipt = useWaitForTransactionReceipt({
    hash: hash ?? undefined,
    query: { enabled: Boolean(hash) },
  });

  const settled = useRef<Hex | null>(null);
  useEffect(() => {
    if (!hash || settled.current === hash) return;
    if (!receipt.isSuccess && !receipt.isError) return;
    settled.current = hash;

    if (receipt.isSuccess) {
      setStage("confirmed");
      toast("success", "Paid", `${list.rows.length} recipients, in one transaction.`);
    } else {
      setStage("failed");
      // All or nothing, so there is no partial payout to explain.
      setStage("failed");
      toast("error", "Transaction failed", "Nobody was paid.");
    }
  }, [hash, receipt.isSuccess, receipt.isError, toast, list.rows.length]);

  const handleSend = useCallback(async () => {
    if (!deployment || !isBotChainId(chainId) || !sendable || insufficient) return;

    setStage("signing");
    setHash(null);
    settled.current = null;

    const recipients = list.rows.map((r) => r.address) as Address[];

    try {
      // `scatterEqual` when every amount matches: it takes one number instead of an array, which
      // is calldata the sender pays for at 16 gas a byte.
      const txHash = uniform
        ? await writeContractAsync({
            address: deployment.address,
            abi: scatterAbi,
            functionName: "scatterEqual",
            args: [recipients, uniform],
            value: list.total,
            chainId,
          })
        : await writeContractAsync({
            address: deployment.address,
            abi: scatterAbi,
            functionName: "scatter",
            args: [recipients, list.rows.map((r) => r.amount)],
            value: list.total,
            chainId,
          });

      setHash(txHash);
      setStage("pending");
    } catch (err) {
      setStage("idle");

      const reverted =
        err instanceof BaseError ? err.walk((e) => e instanceof ContractFunctionRevertedError) : null;
      if (reverted instanceof ContractFunctionRevertedError) {
        const error = reverted.data;
        // Every one of these names the row, which is the difference between "it failed" and
        // "row 42 cannot receive payment".
        if (error?.errorName === "TransferFailed") {
          const [recipient, , index] = error.args as [Address, bigint, bigint];
          const row = list.rows[Number(index)];
          toast(
            "error",
            `Row ${row?.line ?? Number(index) + 1} refused payment`,
            `${recipient} did not accept it, so nobody was paid.`,
          );
          return;
        }
        if (error?.errorName === "ZeroRecipient" || error?.errorName === "ZeroAmount") {
          const [index] = error.args as [bigint];
          toast("error", `Row ${list.rows[Number(index)]?.line ?? Number(index) + 1} is not valid`, "");
          return;
        }
        toast("error", "Refused", error?.errorName ?? "The contract did not say why.");
        return;
      }

      const message = err instanceof BaseError ? err.shortMessage : "Something went wrong.";
      if (/rejected|denied/i.test(message)) toast("info", "Cancelled", "Nobody was paid.");
      else toast("error", "Could not send", message);
    }
  }, [deployment, chainId, list, sendable, insufficient, uniform, writeContractAsync, toast]);

  if (stage === "confirmed") {
    return (
      <Panel>
        <div className="flex flex-col gap-4">
          <TxStatus
            stage="confirmed"
            hash={hash}
            confirmedLabel={`${list.rows.length} recipients paid`}
          />
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            {formatNativeAmount(list.total)} {activeBotChain.nativeCurrency.symbol} sent in one
            transaction.
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              setStage("idle");
              setHash(null);
              setInput("");
            }}
          >
            Send another
          </Button>
        </div>
      </Panel>
    );
  }

  const busy = stage === "signing" || stage === "pending";
  const symbol = activeBotChain.nativeCurrency.symbol;

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <div className="flex flex-col gap-1.5">
          <label
            className="text-[11px] font-medium uppercase tracking-[0.04em]"
            style={{ color: "var(--text-secondary)" }}
            htmlFor="recipients"
          >
            Recipients
          </label>
          <textarea
            id="recipients"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={EXAMPLE}
            rows={10}
            spellCheck={false}
            disabled={busy}
            className="w-full px-3 py-2.5 font-mono text-[12px] outline-none resize-y"
            style={{
              background: "var(--bg-base)",
              border: `1px solid ${list.problems.length > 0 ? "var(--danger)" : "var(--border-default)"}`,
              borderRadius: "4px",
              color: "var(--text-primary)",
            }}
          />
          <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            One per line: address then amount, separated by a comma, tab or space. Up to{" "}
            {MAX_RECIPIENTS}.
          </p>
        </div>
      </Panel>

      {list.problems.length > 0 && (
        <Panel>
          <p
            className="text-[11px] uppercase tracking-[0.06em] mb-2"
            style={{ color: "var(--danger)" }}
          >
            {list.problems.length} {list.problems.length === 1 ? "problem" : "problems"}
          </p>
          <ul className="flex flex-col gap-1.5">
            {list.problems.slice(0, 10).map((problem, i) => (
              <li key={i} className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                <span className="font-mono" style={{ color: "var(--danger)" }}>
                  line {problem.line}
                </span>{" "}
                — {problem.message}
              </li>
            ))}
            {list.problems.length > 10 && (
              <li className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                and {list.problems.length - 10} more.
              </li>
            )}
          </ul>
        </Panel>
      )}

      {list.rows.length > 0 && (
        <Panel>
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <span
                className="text-[11px] uppercase tracking-[0.06em]"
                style={{ color: "var(--text-secondary)" }}
              >
                {list.rows.length} {list.rows.length === 1 ? "recipient" : "recipients"}
              </span>
              <span className="font-mono text-[14px]" style={{ color: "var(--text-primary)" }}>
                {formatNativeAmount(list.total)} {symbol}
              </span>
            </div>

            {balance !== undefined && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  Balance after, before gas
                </span>
                <span
                  className="font-mono text-[12px]"
                  style={{ color: insufficient ? "var(--danger)" : "var(--text-tertiary)" }}
                >
                  {insufficient
                    ? `short by ${formatNativeAmount(list.total - balance.value)} ${symbol}`
                    : `${formatNativeAmount(balance.value - list.total)} ${symbol}`}
                </span>
              </div>
            )}

            {list.duplicates.length > 0 && (
              <p className="text-[11px]" style={{ color: "var(--warning)" }}>
                {list.duplicates.length} address
                {list.duplicates.length === 1 ? " appears" : "es appear"} more than once. That is
                allowed — each row is paid — but worth checking.
              </p>
            )}

            {uniform !== null && list.rows.length > 1 && (
              <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                Every amount is the same, so this uses the cheaper equal-amount call.
              </p>
            )}

            <div
              className="max-h-[220px] overflow-y-auto flex flex-col gap-1"
              style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "10px" }}
            >
              {list.rows.map((row) => (
                <div key={row.line} className="flex items-baseline justify-between gap-3 text-[11px]">
                  <span className="font-mono truncate" style={{ color: "var(--text-tertiary)" }}>
                    {row.address}
                  </span>
                  <span className="font-mono flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
                    {formatEther(row.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      )}

      <Panel>
        <div className="flex flex-col gap-3">
          {stage === "idle" || stage === "failed" ? (
            <Button onClick={handleSend} disabled={!sendable || insufficient}>
              {sendable
                ? `Pay ${list.rows.length} ${list.rows.length === 1 ? "address" : "addresses"}`
                : "Paste a list to continue"}
            </Button>
          ) : null}

          <TxStatus stage={stage} hash={hash} failedLabel="Transaction failed — nobody was paid." />

          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            All or nothing. If any address refuses payment the whole transaction reverts and nobody
            is paid, so there is never a half-finished payout to reconcile.
          </p>
        </div>
      </Panel>
    </div>
  );
}
