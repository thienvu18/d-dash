/** Primitive JSON scalar values. */
export type JsonPrimitive = string | number | boolean | null;

/** Any JSON value supported by persisted contracts. */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/** JSON object with recursively typed JSON values. */
export type JsonObject = {
  [key: string]: JsonValue;
};

/** JSON array with recursively typed JSON values. */
export type JsonArray = JsonValue[];
