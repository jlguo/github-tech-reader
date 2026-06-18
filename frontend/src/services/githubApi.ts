/**
 * GitHubApi — wraps the GitHub REST API using browser fetch().
 */

export interface RepoInfo {
  github_id: number;
  full_name: string;
  owner: string;
  name: string;
  description: string | null;
  html_url: string;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  license: string | null;
  default_branch: string;
  created_at_github: string | null;
  updated_at_github: string | null;
}

export interface Issue {
  title: string;
  body: string;
  state: string;
}

const PRIORITY_EXTENSIONS = new Set([
  ".py", ".ts", ".tsx", ".js", ".go", ".rs", ".md", ".yml", ".yaml", ".toml",
]);

export class GitHubApi {
  private token: string;
  private baseUrl: string;

  constructor(token?: string) {
    this.token = token || "";
    this.baseUrl = "https://api.github.com";
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { ...extra };
    if (this.token) {
      h["Authorization"] = "Bearer " + this.token;
    }
    return h;
  }

  private async handleResponse(resp: Response): Promise<any> {
    if (resp.status === 403) {
      throw new Error(
        "GitHub API rate limit exceeded. Set a GitHub token to increase the limit.",
      );
    }
    if (resp.status === 404) {
      return null;
    }
    if (!resp.ok) {
      throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
    }
    return resp.json();
  }

  /** GET /repos/{fullName} — returns repo metadata. */
  async fetchRepoInfo(fullName: string): Promise<RepoInfo> {
    const url = `${this.baseUrl}/repos/${encodeURIComponent(fullName)}`;
    const resp = await fetch(url, { headers: this.headers() });
    const data = await this.handleResponse(resp);
    if (!data) {
      throw new Error(`Repository "${fullName}" not found.`);
    }
    return {
      github_id: data.id,
      full_name: data.full_name,
      owner: data.owner?.login ?? "",
      name: data.name,
      description: data.description ?? null,
      html_url: data.html_url,
      stars: data.stargazers_count ?? 0,
      forks: data.forks_count ?? 0,
      language: data.language ?? null,
      topics: data.topics ?? [],
      license: data.license?.spdx_id ?? data.license?.name ?? null,
      default_branch: data.default_branch ?? "main",
      created_at_github: data.created_at ?? null,
      updated_at_github: data.updated_at ?? null,
    };
  }

  /** GET /repos/{fullName}/readme — returns raw readme text or null. */
  async fetchReadme(fullName: string): Promise<string | null> {
    const url = `${this.baseUrl}/repos/${encodeURIComponent(fullName)}/readme`;
    const resp = await fetch(url, {
      headers: this.headers({ Accept: "application/vnd.github.raw+json" }),
    });
    if (resp.status === 404) {
      return null;
    }
    if (resp.status === 403) {
      throw new Error(
        "GitHub API rate limit exceeded. Set a GitHub token to increase the limit.",
      );
    }
    if (!resp.ok) {
      throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
    }
    return resp.text();
  }

  /**
   * GET /repos/{fullName}/git/trees/HEAD?recursive=1
   * Filters to blobs with priority extensions, max file size 100KB,
   * sorted by size desc, capped at maxFiles (default 100).
   * Then fetches each file's content via GET /repos/{fullName}/contents/{path}
   * Returns Record<string, string> mapping file path to content.
   */
  async fetchKeyFiles(
    fullName: string,
    maxFiles: number = 100,
  ): Promise<Record<string, string>> {
    // 1. Get the recursive tree
    const treeUrl = `${this.baseUrl}/repos/${encodeURIComponent(fullName)}/git/trees/HEAD?recursive=1`;
    const treeResp = await fetch(treeUrl, { headers: this.headers() });
    const treeData = await this.handleResponse(treeResp);
    if (!treeData) {
      throw new Error(`Repository "${fullName}" not found.`);
    }

    // 2. Filter blobs by extension and size
    const blobs: { path: string; size: number }[] = (treeData.tree ?? []).filter(
      (entry: any) =>
        entry.type === "blob" &&
        PRIORITY_EXTENSIONS.has(getExtension(entry.path)) &&
        entry.size <= 100_000,
    );

    // 3. Sort by size descending, limit to maxFiles
    blobs.sort((a, b) => b.size - a.size);
    const selected = blobs.slice(0, maxFiles);

    // 4. Fetch each file's content
    const result: Record<string, string> = {};
    await Promise.all(
      selected.map(async (blob) => {
        try {
          const contentUrl = `${this.baseUrl}/repos/${encodeURIComponent(fullName)}/contents/${encodeURIComponent(blob.path)}`;
          const resp = await fetch(contentUrl, {
            headers: this.headers({ Accept: "application/vnd.github.raw+json" }),
          });
          if (resp.ok) {
            result[blob.path] = await resp.text();
          }
        } catch {
          // Silently skip files that fail to fetch
        }
      }),
    );

    return result;
  }

  /**
   * GET /repos/{fullName}/issues?state=all&per_page=count&sort=comments&direction=desc
   * Returns top issues.
   */
  async fetchTopIssues(
    fullName: string,
    count: number = 10,
  ): Promise<Issue[]> {
    const url = `${this.baseUrl}/repos/${encodeURIComponent(fullName)}/issues?state=all&per_page=${count}&sort=comments&direction=desc`;
    const resp = await fetch(url, { headers: this.headers() });
    const data = await this.handleResponse(resp);
    if (!data) {
      return [];
    }
    return (data as any[]).map((issue: any) => ({
      title: issue.title ?? "",
      body: issue.body ?? "",
      state: issue.state ?? "unknown",
    }));
  }
}

function getExtension(path: string): string {
  const i = path.lastIndexOf(".");
  return i >= 0 ? path.slice(i).toLowerCase() : "";
}
