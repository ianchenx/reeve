---
name: reeve-linear
description: |
  Query and mutate Linear issues via the linear-graphql MCP server.
  Use for state transitions, comments, PR linking, and issue lookup.
---

# Linear

All Linear operations go through the `linear-graphql` MCP server.

## Tools

| Tool | Use |
|------|-----|
| `query-graphql` | Run any GraphQL query or mutation |
| `introspect-schema` | Browse the full schema (use sparingly) |

## Lookup an Issue

By key (e.g. `WOR-42`):

```graphql
query ($key: String!) {
  issue(id: $key) {
    id identifier title url description
    state { id name type }
    team { id key states { nodes { id name type } } }
  }
}
```

## Move Issue State

First get the team's available states (from the issue lookup above),
then update:

```graphql
mutation ($id: String!, $stateId: String!) {
  issueUpdate(id: $id, input: { stateId: $stateId }) {
    success
    issue { id identifier state { name } }
  }
}
```

Always resolve the `stateId` from the team's states — never hardcode.

## Post a Comment

```graphql
mutation ($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) {
    success
    comment { id url }
  }
}
```

## Update a Comment (Workpad)

The agent maintains a "Workpad" comment on each issue to track progress
across continuation turns:

```graphql
mutation ($id: String!, $body: String!) {
  commentUpdate(id: $id, input: { body: $body }) {
    success
    comment { id body }
  }
}
```

## Link a GitHub PR

```graphql
mutation ($issueId: String!, $url: String!, $title: String) {
  attachmentLinkGitHubPR(
    issueId: $issueId, url: $url, title: $title, linkKind: links
  ) {
    success
    attachment { id url }
  }
}
```

## Discover Unfamiliar Operations

When you need a mutation or type you haven't seen:

```graphql
query { __type(name: "Mutation") { fields { name } } }
```

```graphql
query { __type(name: "SomeInput") { inputFields { name type { name kind } } } }
```

## Rules

- One operation per tool call
- Check for `errors` in the response — a tool "success" doesn't mean the
  GraphQL operation succeeded
- Fetch team states before any state transition
- Prefer `attachmentLinkGitHubPR` over generic URL attachments for PRs
