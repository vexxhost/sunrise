import { describe, expect, it } from "vitest";
import { parseXML } from "@aws-sdk/xml-builder";
import {
  addCephUntagRoleParameter,
  normalizeCephListRoleTagsResponse,
} from "@/lib/s3/iam-role-tags";

describe("Ceph IAM role tag compatibility", () => {
  it("normalizes the Ceph 20.x parallel key and value response", () => {
    const xml = [
      "<ListRoleTagsResponse><ListRoleTagsResult><Tags>",
      "<Key><Key>project-access</Key></Key>",
      "<Value><Value>project-a:readwrite</Value></Value>",
      "<Key><Key>environment</Key></Key>",
      "<Value><Value>development</Value></Value>",
      "</Tags><IsTruncated>true</IsTruncated><Marker>next</Marker>",
      "</ListRoleTagsResult></ListRoleTagsResponse>",
    ].join("");

    expect(parseXML(normalizeCephListRoleTagsResponse(xml))).toEqual({
      ListRoleTagsResponse: {
        ListRoleTagsResult: {
          Tags: {
            member: [
              {
                Key: "project-access",
                Value: "project-a:readwrite",
              },
              { Key: "environment", Value: "development" },
            ],
          },
          IsTruncated: "true",
          Marker: "next",
        },
      },
    });
  });

  it("leaves the standard AWS member response unchanged", () => {
    const xml =
      "<ListRoleTagsResponse><ListRoleTagsResult><Tags>" +
      "<member><Key>owner</Key><Value>sunrise</Value></member>" +
      "</Tags></ListRoleTagsResult></ListRoleTagsResponse>";

    expect(normalizeCephListRoleTagsResponse(xml)).toBe(xml);
  });

  it("does not rewrite an incomplete Ceph response", () => {
    const xml =
      "<ListRoleTagsResponse><ListRoleTagsResult><Tags>" +
      "<Key><Key>owner</Key></Key>" +
      "</Tags></ListRoleTagsResult></ListRoleTagsResponse>";

    expect(normalizeCephListRoleTagsResponse(xml)).toBe(xml);
  });

  it("adds the legacy Ceph unnumbered tag-key parameter", () => {
    const body = addCephUntagRoleParameter(
      "Action=UntagRole&RoleName=test1111&TagKeys.member.1=owner&Version=2010-05-08",
      "owner",
    );
    const params = new URLSearchParams(body);

    expect(params.get("TagKeys.member.1")).toBe("owner");
    expect(params.get("TagKeys.member.")).toBe("owner");
  });
});
