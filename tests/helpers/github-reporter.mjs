// Node test reporter for GitHub Actions: each failing test becomes an error annotation on the run,
// so a failure can be read from the PR checks without opening the full log.
export default async function* githubReporter(source) {
  for await (const event of source) {
    if (event.type !== "test:fail" || event.data.details?.type === "suite") continue;
    const { name, file, line, details } = event.data;
    const error = details?.error;
    const message = String(error?.cause?.message ?? error?.message ?? "failed").replace(/\r?\n/g, "%0A").slice(0, 1500);
    const where = file ? `file=${file.replace(`${process.cwd()}/`, "")},line=${line ?? 1},` : "";
    yield `::error ${where}title=${String(name).replace(/[,:]/g, " ")}::${message}\n`;
  }
}
