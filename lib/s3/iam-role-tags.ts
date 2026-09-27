import {
  ListRoleTagsCommand,
  UntagRoleCommand,
  type IAMClient,
  type ListRoleTagsCommandInput,
  type ListRoleTagsCommandOutput,
  type UntagRoleCommandInput,
  type UntagRoleCommandOutput,
} from "@aws-sdk/client-iam";
import { parseXML, XmlNode } from "@aws-sdk/xml-builder";
import type { BuildMiddleware, DeserializeMiddleware } from "@smithy/types";

type XmlRecord = Record<string, unknown>;

function asRecord(value: unknown): XmlRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as XmlRecord)
    : null;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function nestedString(value: unknown, key: string) {
  const record = asRecord(value);
  return record && typeof record[key] === "string" ? record[key] : null;
}

function childText(record: XmlRecord, key: string) {
  return typeof record[key] === "string" ? record[key] : null;
}

/**
 * Ceph 20.x emits role tags as parallel nested Key and Value elements instead
 * of the AWS Query member list. Normalize only that response shape so the AWS
 * SDK can continue to handle transport, metadata, and pagination.
 */
export function normalizeCephListRoleTagsResponse(xml: string) {
  const parsed = parseXML(xml) as unknown;
  const response = asRecord(asRecord(parsed)?.ListRoleTagsResponse);
  const result = asRecord(response?.ListRoleTagsResult);
  const tags = asRecord(result?.Tags);

  if (!response || !result || !tags || "member" in tags) return xml;

  const keys = asArray(tags.Key)
    .map((value) => nestedString(value, "Key"))
    .filter((value): value is string => value !== null);
  const values = asArray(tags.Value)
    .map((value) => nestedString(value, "Value"))
    .filter((value): value is string => value !== null);

  if (keys.length === 0 || keys.length !== values.length) return xml;

  const tagsNode = new XmlNode("Tags");
  keys.forEach((key, index) => {
    tagsNode.c(
      new XmlNode("member")
        .c(XmlNode.of("Key", key))
        .c(XmlNode.of("Value", values[index])),
    );
  });

  const resultNode = new XmlNode("ListRoleTagsResult").c(tagsNode);
  const isTruncated = childText(result, "IsTruncated");
  const marker = childText(result, "Marker");
  if (isTruncated !== null) {
    resultNode.c(XmlNode.of("IsTruncated", isTruncated));
  }
  if (marker !== null) resultNode.c(XmlNode.of("Marker", marker));

  return new XmlNode("ListRoleTagsResponse").c(resultNode).toString();
}

export function addCephUntagRoleParameter(body: string, tagKey: string) {
  const params = new URLSearchParams(body);
  params.set("TagKeys.member.", tagKey);
  return params.toString();
}

export async function listRoleTagsWithCephCompatibility(
  client: IAMClient,
  input: ListRoleTagsCommandInput,
): Promise<ListRoleTagsCommandOutput> {
  const command = new ListRoleTagsCommand(input);
  const compatibilityMiddleware: DeserializeMiddleware<
    ListRoleTagsCommandInput,
    ListRoleTagsCommandOutput
  > = (next) => async (args) => {
    const middlewareResult = await next(args);
    const response = middlewareResult.response as {
      body?: Parameters<typeof client.config.streamCollector>[0];
    };

    if (response.body !== undefined) {
      const bytes = await client.config.streamCollector(response.body);
      const xml = Buffer.from(bytes).toString("utf8");
      response.body = Buffer.from(normalizeCephListRoleTagsResponse(xml));
    }

    return middlewareResult;
  };

  command.middlewareStack.addRelativeTo(compatibilityMiddleware, {
    name: "cephListRoleTagsResponseMiddleware",
    relation: "after",
    toMiddleware: "deserializerMiddleware",
    override: true,
  });

  return client.send(command);
}

export async function untagRoleWithCephCompatibility(
  client: IAMClient,
  roleName: string,
  tagKeys: string[],
) {
  for (const tagKey of tagKeys) {
    const input: UntagRoleCommandInput = {
      RoleName: roleName,
      TagKeys: [tagKey],
    };
    const command = new UntagRoleCommand(input);
    const compatibilityMiddleware: BuildMiddleware<
      UntagRoleCommandInput,
      UntagRoleCommandOutput
    > = (next) => async (args) => {
      const request = args.request as { body?: unknown };
      if (typeof request.body === "string") {
        request.body = addCephUntagRoleParameter(request.body, tagKey);
      }
      return next(args);
    };

    command.middlewareStack.addRelativeTo(compatibilityMiddleware, {
      name: "cephUntagRoleRequestMiddleware",
      relation: "after",
      toMiddleware: "serializerMiddleware",
      override: true,
    });
    await client.send(command);
  }
}
