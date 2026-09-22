import { statusLabels, type RoundView } from "./types";

function csvCell(value: string | number | bigint | boolean) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: Array<Array<string | number | bigint | boolean>>) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function roundSubmissionsCsv(round: RoundView) {
  const winners = new Set(round.winners.map(String));
  return csv([
    [
      "submission_id",
      "owner",
      "type",
      "status",
      "title",
      "description",
      "metadata_uri",
      "metadata_hash",
      "title_hash",
      "description_hash",
      "votes",
      "winner",
    ],
    ...round.submissions.map((submission) => [
      submission.id,
      submission.owner,
      submission.submissionType,
      statusLabels[submission.status],
      submission.metadata?.title || "",
      submission.metadata?.description || "",
      submission.metadataURI,
      submission.metadataHash,
      submission.titleHash,
      submission.descriptionHash,
      submission.votes,
      winners.has(submission.id.toString()),
    ]),
  ]);
}

export function roundVoteActivityCsv(round: RoundView) {
  return csv([
    [
      "voter",
      "submission_id",
      "amount_added",
      "voter_submission_total",
      "submission_total",
      "transaction_hash",
      "log_index",
    ],
    ...round.voteActivity.map((vote) => [
      vote.voter,
      vote.submissionId,
      vote.amount,
      vote.voterSubmissionTotal,
      vote.submissionTotal,
      vote.transactionHash || "",
      vote.logIndex,
    ]),
  ]);
}

export function downloadCsv(filename: string, contents: string) {
  const url = URL.createObjectURL(
    new Blob([contents], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
