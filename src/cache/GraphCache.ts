import * as fs from 'fs';
import * as path from 'path';

export interface GraphNode {
  url: string;
  outLinks: string[]; // URLs this page links to
  resources: string[]; // Images, CSS, JS, etc.
  lastParsed: string;
}

export interface GraphManifest {
  version: string;
  lastUpdated: string;
  nodes: Record<string, GraphNode>;
}

export class GraphCache {
  private manifestPath: string;
  private manifest: GraphManifest;
  private modified: boolean = false;

  constructor(cacheDir: string = '.gssg-cache') {
    this.manifestPath = path.join(process.cwd(), cacheDir, 'graph.json');
    this.manifest = this.loadManifest();
  }

  private loadManifest(): GraphManifest {
    try {
      if (fs.existsSync(this.manifestPath)) {
        const data = fs.readFileSync(this.manifestPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn('Failed to load graph cache, starting fresh:', error);
    }

    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      nodes: {},
    };
  }

  public getNode(url: string): GraphNode | null {
    return this.manifest.nodes[url] || null;
  }

  public setNode(url: string, outLinks: string[], resources: string[]): void {
    this.manifest.nodes[url] = {
      url,
      outLinks: Array.from(new Set(outLinks)), // dedupe
      resources: Array.from(new Set(resources)), // dedupe
      lastParsed: new Date().toISOString(),
    };
    this.modified = true;
  }

  public hasNode(url: string): boolean {
    return url in this.manifest.nodes;
  }

  public removeNode(url: string): void {
    delete this.manifest.nodes[url];
    this.modified = true;
  }

  public getAllUrls(): string[] {
    const urls = new Set<string>();

    // Collect all URLs from nodes
    for (const node of Object.values(this.manifest.nodes)) {
      urls.add(node.url);
      node.outLinks.forEach(link => urls.add(link));
      node.resources.forEach(resource => urls.add(resource));
    }

    return Array.from(urls);
  }

  public getChildUrls(url: string): string[] {
    const node = this.getNode(url);
    if (!node) {
      return [];
    }
    return [...node.outLinks, ...node.resources];
  }

  public save(): void {
    if (!this.modified) {
      return;
    }

    try {
      const dir = path.dirname(this.manifestPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.manifest.lastUpdated = new Date().toISOString();
      fs.writeFileSync(
        this.manifestPath,
        JSON.stringify(this.manifest, null, 2),
        'utf8'
      );
      this.modified = false;
      console.log(`Graph cache saved with ${Object.keys(this.manifest.nodes).length} nodes`);
    } catch (error) {
      console.error('Failed to save graph cache:', error);
    }
  }

  public getStats(): { nodes: number; totalLinks: number; totalResources: number } {
    const nodes = Object.values(this.manifest.nodes);
    return {
      nodes: nodes.length,
      totalLinks: nodes.reduce((sum, n) => sum + n.outLinks.length, 0),
      totalResources: nodes.reduce((sum, n) => sum + n.resources.length, 0),
    };
  }
}

