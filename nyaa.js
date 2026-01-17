class NyaaExtension {
  constructor() {
    this.name = "Nyaa";
    this.version = "1.0.0";
    this.baseUrl = "https://nyaa.si";
  }

  /**
   * Search for a single episode
   */
  async single(options) {
    const { titles, episode, resolution, exclusions } = options;
    
    if (!episode) return [];
    
    // Build search query with primary title and episode number
    const searchTerms = [
      titles[0],
      this.formatEpisode(episode)
    ];
    
    if (resolution) {
      searchTerms.push(resolution + 'p');
    }
    
    const results = await this.search(searchTerms.join(' '), exclusions);
    
    // Filter for single episode releases (not batches)
    return results.filter(r => !this.isBatch(r.title));
  }

  /**
   * Search for batch releases
   */
  async batch(options) {
    const { titles, resolution, exclusions } = options;
    
    const searchTerms = [titles[0]];
    
    if (resolution) {
      searchTerms.push(resolution + 'p');
    }
    
    const results = await this.search(searchTerms.join(' '), exclusions);
    
    // Filter for batch releases
    return results
      .filter(r => this.isBatch(r.title))
      .map(r => ({ ...r, type: 'batch' }));
  }

  /**
   * Search for movies
   */
  async movie(options) {
    const { titles, resolution, exclusions } = options;
    
    const searchTerms = [titles[0], 'movie'];
    
    if (resolution) {
      searchTerms.push(resolution + 'p');
    }
    
    return await this.search(searchTerms.join(' '), exclusions);
  }

  /**
   * Perform search on Nyaa RSS feed
   */
  async search(query, exclusions = []) {
    try {
      const url = `${this.baseUrl}/?page=rss&q=${encodeURIComponent(query)}&c=1_2&f=0`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const text = await response.text();
      const results = this.parseRSS(text);
      
      // Apply exclusions
      return results.filter(result => {
        const titleLower = result.title.toLowerCase();
        return !exclusions.some(exc => titleLower.includes(exc.toLowerCase()));
      });
      
    } catch (error) {
      console.error('Nyaa search error:', error);
      return [];
    }
  }

  /**
   * Parse RSS XML response manually (Web Worker compatible)
   */
  parseRSS(xmlText) {
    const results = [];
    
    // Extract all <item> blocks
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let itemMatch;
    
    while ((itemMatch = itemRegex.exec(xmlText)) !== null) {
      try {
        const itemXml = itemMatch[1];
        
        const title = this.extractTag(itemXml, 'title');
        const link = this.extractTag(itemXml, 'link');
        const pubDate = this.extractTag(itemXml, 'pubDate');
        const seeders = parseInt(this.extractTag(itemXml, 'nyaa:seeders') || '0');
        const leechers = parseInt(this.extractTag(itemXml, 'nyaa:leechers') || '0');
        const downloads = parseInt(this.extractTag(itemXml, 'nyaa:downloads') || '0');
        const size = parseInt(this.extractTag(itemXml, 'nyaa:size') || '0');
        const infoHash = this.extractTag(itemXml, 'nyaa:infoHash');
        const category = this.extractTag(itemXml, 'nyaa:category');
        
        if (!title || !infoHash) continue;
        
        // Determine if trusted/verified
        const isTrusted = category?.includes('trusted') || 
                         title.includes('✓') || 
                         seeders > 50;
        
        results.push({
          title: this.decodeHTML(title),
          link: link || `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}`,
          seeders: seeders,
          leechers: leechers,
          downloads: downloads,
          hash: infoHash.toLowerCase(),
          size: size,
          verified: isTrusted,
          date: new Date(pubDate || Date.now()),
          type: undefined
        });
      } catch (error) {
        console.error('Error parsing item:', error);
      }
    }
    
    return results;
  }

  /**
   * Extract content from XML tag
   */
  extractTag(xml, tagName) {
    const regex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tagName}>|<${tagName}[^>]*>([\\s\\S]*?)<\/${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? (match[1] || match[2] || '').trim() : '';
  }

  /**
   * Decode HTML entities
   */
  decodeHTML(text) {
    const entities = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'"
    };
    
    return text.replace(/&[#a-z0-9]+;/gi, match => entities[match] || match);
  }

  /**
   * Format episode number with leading zero (e.g., 1 -> "01")
   */
  formatEpisode(episode) {
    if (episode < 10) {
      return `0${episode}`;
    }
    return episode.toString();
  }

  /**
   * Check if title indicates a batch release
   */
  isBatch(title) {
    const batchKeywords = [
      'batch',
      'complete',
      'vol',
      '01-',
      '1-',
      'season',
      's1',
      's2',
      's3',
      's4'
    ];
    
    const titleLower = title.toLowerCase();
    return batchKeywords.some(keyword => titleLower.includes(keyword));
  }
}

// Export the extension
self.extension = new NyaaExtension();
