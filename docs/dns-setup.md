# DNS setup for `rangeley.cloudnomad.us`

`cloudnomad.us`'s nameservers point at GoDaddy (`ns19/ns20.domaincontrol.com`),
so the CNAME for the subdomain needs to be added in the **GoDaddy DNS
management** page for `cloudnomad.us`.

## The record to add

| Type  | Name      | Value                        | TTL   |
| ----- | --------- | ---------------------------- | ----- |
| CNAME | `rangeley` | `apollostable.github.io.`   | 1 hour |

In GoDaddy's UI:

1. Sign in → My Products → DNS for **cloudnomad.us**.
2. Add new record:
   - **Type:** CNAME
   - **Name:** `rangeley` *(just the subdomain piece, not the full host)*
   - **Value:** `apollostable.github.io` *(GoDaddy may auto-add a trailing dot)*
   - **TTL:** 1 hour (or whatever GoDaddy's default is — TTL only affects propagation speed)
3. Save.

## Verification

Once the record propagates (anywhere from seconds to ~1 hour):

```bash
nslookup rangeley.cloudnomad.us
# Expected: an Alias for apollostable.github.io
#           addresses 185.199.108.153 / 109.153 / 110.153 / 111.153

curl -I https://rangeley.cloudnomad.us
# Expected: HTTP/2 200, Server: GitHub.com
```

GitHub Pages will auto-provision a Let's Encrypt cert once it sees the CNAME
pointing back at the right repo. That can take a few minutes after DNS
propagates. After the cert is live, in the repo's Pages settings flip on
"Enforce HTTPS" (or I can do it via `gh api`).

## Why CNAME and not A records

The apex domain `cloudnomad.us` already uses A records pointing at GitHub
Pages — that's required because DNS doesn't allow CNAMEs at apex. For
subdomains, CNAME to `apollostable.github.io` is the recommended path: it
lets GitHub keep adding/removing edge IPs without you needing to update DNS.
