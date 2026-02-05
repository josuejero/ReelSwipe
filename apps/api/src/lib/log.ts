export type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

export function log(level: LogLevel, fields: LogFields) {
  const record = {
    ts: new Date().toISOString(),
    level,
    ...fields,
  };

  const line = JSON.stringify(record);

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
