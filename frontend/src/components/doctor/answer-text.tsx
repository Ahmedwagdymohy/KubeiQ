import { CodeBlock, RichText, Terminal } from "@/components/ui";

type Block =
  | { kind: "p" | "ul" | "ol"; lines: string[] }
  | { kind: "commands"; lines: string[] }
  | { kind: "code"; text: string };

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const SHELL = new Set(["sh", "bash", "shell", "console", "zsh"]);
const COMMAND = /^(\$\s*)?(kubectl|helm|kustomize|curl|docker)\b/;

/** Splits an answer into paragraphs, lists and fenced code, the only formatting we ask for. */
function parse(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*```\s*([\w-]*)/);
    if (fence) {
      const body: string[] = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i]);
      const filled = body.filter((l) => l.trim());
      if (!filled.length) continue;
      const commands = SHELL.has(fence[1].toLowerCase()) || filled.every((l) => COMMAND.test(l.trim()));
      blocks.push(
        commands
          ? { kind: "commands", lines: filled.map((l) => l.trim().replace(/^\$\s*/, "")) }
          : { kind: "code", text: body.join("\n").trimEnd() },
      );
      continue;
    }
    if (!line.trim()) continue;
    const kind = BULLET.test(line) ? "ul" : NUMBERED.test(line) ? "ol" : "p";
    const content = line.replace(kind === "ul" ? BULLET : kind === "ol" ? NUMBERED : /^\s*#*\s*/, "");
    const last = blocks.at(-1);
    const blankBefore = i > 0 && !lines[i - 1].trim();
    if (last && last.kind === kind && (kind !== "p" || !blankBefore)) {
      if (kind === "p") last.lines[last.lines.length - 1] += ` ${content.trim()}`;
      else last.lines.push(content);
    } else {
      blocks.push({ kind, lines: [content.trim()] });
    }
  }
  return blocks;
}

/** Inline formatting: **bold** and `code`. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i} className="font-semibold text-fg">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <RichText key={i} text={part} />
        ),
      )}
    </>
  );
}

export function AnswerText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3">
      {parse(text).map((block, i) => {
        switch (block.kind) {
          case "commands":
            return <Terminal key={i} commands={block.lines} />;
          case "code":
            return <CodeBlock key={i} text={block.text} />;
          case "ul":
          case "ol": {
            const List = block.kind;
            return (
              <List
                key={i}
                className={`flex flex-col gap-1 pl-5 ${block.kind === "ul" ? "list-disc" : "list-decimal"}`}
              >
                {block.lines.map((line, j) => (
                  <li key={j}>
                    <Inline text={line} />
                  </li>
                ))}
              </List>
            );
          }
          default:
            return (
              <p key={i}>
                <Inline text={block.lines[0]} />
              </p>
            );
        }
      })}
    </div>
  );
}
