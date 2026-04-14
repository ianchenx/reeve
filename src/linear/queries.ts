// linear/queries.ts — GraphQL queries for Linear API
// Uses top-level `issues` queries to stay under complexity limits

export const FETCH_PROJECT_ISSUES = `
  query FetchProjectIssues($projectSlug: String!, $states: [String!]) {
    issues(
      filter: {
        project: { slugId: { eq: $projectSlug } }
        state: { name: { in: $states } }
      }
      first: 50
      orderBy: updatedAt
    ) {
      nodes {
        id
        identifier
        title
        description
        url
        priority
        createdAt
        state {
          name
          type
        }
        labels {
          nodes {
            name
            parent {
              name
            }
          }
        }
        parent {
          id
          identifier
          state {
            name
          }
        }
        inverseRelations {
          nodes {
            type
            issue {
              id
              identifier
              state { name }
            }
          }
        }
        comments(first: 10) {
          nodes {
            body
            user {
              name
            }
            createdAt
          }
        }
      }
    }
  }
`

export const FETCH_ISSUES_BY_IDS = `
  query FetchIssuesByIds($ids: [ID!]!) {
    issues(filter: { id: { in: $ids } }) {
      nodes {
        id
        identifier
        state {
          name
        }
      }
    }
  }
`

export const UPDATE_ISSUE_STATE = `
  mutation UpdateIssueState($issueId: String!, $stateId: String!) {
    issueUpdate(id: $issueId, input: { stateId: $stateId }) {
      success
      issue {
        id
        identifier
        state {
          name
        }
      }
    }
  }
`

export const ADD_ISSUE_COMMENT = `
  mutation AddIssueComment($issueId: String!, $body: String!) {
    commentCreate(input: { issueId: $issueId, body: $body }) {
      success
      comment {
        id
      }
    }
  }
`

export const FETCH_WORKFLOW_STATES = `
  query FetchWorkflowStates($teamKey: String!) {
    teams(filter: { key: { eq: $teamKey } }) {
      nodes {
        id
        states {
          nodes {
            id
            name
            type
          }
        }
      }
    }
  }
`

export const FETCH_ISSUES_BY_TITLE = `
  query FetchIssuesByTitle($projectSlug: String!, $title: String!) {
    issues(
      filter: {
        project: { slugId: { eq: $projectSlug } }
        title: { eq: $title }
      }
      first: 50
      orderBy: updatedAt
    ) {
      nodes {
        id
        identifier
        title
        state {
          name
          type
        }
      }
    }
  }
`

export const FETCH_PROJECT_BY_SLUG = `
  query FetchProjectBySlug($projectSlug: String!) {
    projects(filter: { slugId: { eq: $projectSlug } }) {
      nodes {
        id
        slugId
        teams {
          nodes {
            id
            key
          }
        }
      }
    }
  }
`

export const FETCH_ISSUE_TEAM = `
  query FetchIssueTeam($issueId: ID!) {
    issues(filter: { id: { eq: $issueId } }) {
      nodes {
        id
        team {
          id
          key
        }
      }
    }
  }
`

export const FETCH_ISSUE_LABELS = `
  query FetchIssueLabels($names: [String!]) {
    issueLabels(filter: { name: { in: $names } }, first: 50) {
      nodes {
        id
        name
      }
    }
  }
`

export const CREATE_ISSUE = `
  mutation CreateIssue(
    $teamId: String!
    $projectId: String!
    $stateId: String!
    $title: String!
    $description: String!
    $labelIds: [String!]
  ) {
    issueCreate(input: {
      teamId: $teamId
      projectId: $projectId
      stateId: $stateId
      title: $title
      description: $description
      labelIds: $labelIds
    }) {
      success
      issue {
        id
        identifier
      }
    }
  }
`
