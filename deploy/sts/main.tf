resource "radosgw_iam_openid_connect_provider" "keycloak" {
  url = "https://keycloak.cloud.domain.tld/realms/atmosphere"

  client_id_list = [
    "account",
    "rgw-client-public-browser"
  ]

  thumbprint_list = [
    "DFCC449A3B08CAD367CC37F6F38B2619477521AB",
    "75091D1AEA666C62FC4A8F1681F8F885FF6BBF22"
  ]
}

data "radosgw_iam_policy_document" "trust_policy" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = ["arn:aws:iam:::oidc-provider/keycloak.cloud.domain.tld/realms/atmosphere"]
    }

    condition {
      test     = "StringEquals"
      variable = "keycloak.cloud.domain.tld/realms/atmosphere:aud"
      values   = [
        "account",
        "rgw-client-public-browser"
      ]
    }
  }
}

resource "radosgw_iam_role" "assume_role" {
  name                 = "AssumeRoleSunrise"
  path                 = "/service-roles/"
  assume_role_policy   = data.radosgw_iam_policy_document.trust_policy.json
  max_session_duration = 3600 # 1 hour
}

data "radosgw_iam_policy_document" "s3_readonly" {
  statement {
    sid     = "AllowS3ReadOnly"
    effect  = "Allow"
    actions = ["s3:GetObject", "s3:ListBucket"]
    resources = [
      "arn:aws:s3:::artifacts",
      "arn:aws:s3:::artifacts/*"
    ]
  }
}

resource "radosgw_iam_role_policy" "s3_readonly" {
  role   = radosgw_iam_role.assume_role.name
  name   = "S3ReadOnlyPolicy"
  policy = data.radosgw_iam_policy_document.s3_readonly.json
}

# Multiple policies can be attached to the same role
resource "radosgw_iam_role_policy" "s3_list" {
  role = radosgw_iam_role.assume_role.name
  name = "S3ListPolicy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "s3:ListAllMyBuckets"
        Resource = "*"
      }
    ]
  })
}

resource "radosgw_iam_role_policy" "s3_create" {
  role = radosgw_iam_role.assume_role.name
  name = "S3CreatePolicy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "s3:CreateBucket"
        Resource = "*"
      }
    ]
  })
}
