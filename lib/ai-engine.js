/**
 * LinkLead AI Engine — Local Analytics Intelligence
 * 
 * All functions in this module run on the server with ZERO external API calls.
 * They use statistical methods, rule engines, and heuristics to transform
 * raw click data into actionable lead-generation insights.
 */

// ─── Trend Analysis ─────────────────────────────────────────────────────────

/**
 * Computes the linear regression trend over daily click data.
 * Returns direction, percent change, and slope.
 */
export function computeTrend(chartData) {
  const { labels, data } = chartData || {};
  if (!data || data.length < 2) {
    return { direction: 'stable', percentChange: 0, slope: 0, label: 'Stable' };
  }

  const n = data.length;
  const xMean = (n - 1) / 2;
  const yMean = data.reduce((s, v) => s + v, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (data[i] - yMean);
    denominator += (i - xMean) ** 2;
  }
  const slope = denominator !== 0 ? numerator / denominator : 0;

  // Compare first week avg vs last week avg for percent change
  const firstWeek = data.slice(0, 7);
  const lastWeek = data.slice(-7);
  const firstAvg = firstWeek.reduce((s, v) => s + v, 0) / firstWeek.length;
  const lastAvg = lastWeek.reduce((s, v) => s + v, 0) / lastWeek.length;

  let percentChange = 0;
  if (firstAvg > 0) {
    percentChange = Math.round(((lastAvg - firstAvg) / firstAvg) * 100);
  } else if (lastAvg > 0) {
    percentChange = 100;
  }

  let direction, label;
  if (slope > 0.15) {
    direction = 'growing';
    label = `Growing (+${Math.abs(percentChange)}%)`;
  } else if (slope < -0.15) {
    direction = 'declining';
    label = `Declining (${percentChange}%)`;
  } else {
    direction = 'stable';
    label = 'Stable';
  }

  return { direction, percentChange, slope: Math.round(slope * 100) / 100, label };
}

// ─── Audience Profile ───────────────────────────────────────────────────────

/**
 * Builds a comprehensive audience profile from aggregated stats.
 */
export function computeAudienceProfile(stats) {
  if (!stats || stats.totalClicks === 0) {
    return {
      primaryDevice: 'Unknown',
      deviceBreakdown: {},
      topCountries: [],
      topReferrers: [],
      topBrowsers: [],
      summary: 'No audience data available yet. Share your links to start building a profile.'
    };
  }

  const devices = stats.devices || {};
  const deviceEntries = Object.entries(devices).sort((a, b) => b[1] - a[1]);
  const primaryDevice = deviceEntries[0]?.[0] || 'Unknown';
  const primaryDevicePct = stats.totalClicks > 0
    ? Math.round((deviceEntries[0]?.[1] || 0) / stats.totalClicks * 100)
    : 0;

  const topCountries = (stats.countries || []).slice(0, 5);
  const topReferrers = (stats.referrers || []).slice(0, 5);
  const topBrowsers = (stats.browsers || []).slice(0, 3);

  // Build a natural language summary
  const parts = [];
  parts.push(`Your audience is primarily on ${primaryDevice} (${primaryDevicePct}%)`);
  if (topCountries.length > 0) {
    const geoNames = topCountries.slice(0, 3).map(c => c.name).join(', ');
    parts.push(`concentrated in ${geoNames}`);
  }
  if (topReferrers.length > 0 && topReferrers[0].name !== 'Direct') {
    parts.push(`with most traffic coming from ${topReferrers[0].name}`);
  } else if (topReferrers.length > 0) {
    parts.push(`with most traffic arriving via direct links`);
  }

  return {
    primaryDevice,
    primaryDevicePct,
    deviceBreakdown: devices,
    topCountries,
    topReferrers,
    topBrowsers,
    summary: parts.join(', ') + '.'
  };
}

// ─── Opportunity Score ──────────────────────────────────────────────────────

/**
 * Computes a 0-100 opportunity score based on four dimensions:
 * - Click velocity (25%): Average daily clicks in the last 7 days
 * - Growth trend (25%): Positive trend = higher score
 * - Geo diversity (25%): More countries = higher potential
 * - Referrer diversity (25%): Multiple traffic sources = healthier
 */
export function computeOpportunityScore(stats, trend) {
  if (!stats || stats.totalClicks === 0) return { score: 0, breakdown: {} };

  // 1. Click velocity (0-25): based on daily clicks in last 7 days
  const last7 = (stats.chart?.data || []).slice(-7);
  const avgDaily = last7.reduce((s, v) => s + v, 0) / Math.max(last7.length, 1);
  const velocityScore = Math.min(25, Math.round(avgDaily * 5)); // 5 clicks/day = max

  // 2. Growth trend (0-25)
  const trendDirection = trend?.direction || 'stable';
  const pctChange = trend?.percentChange || 0;
  let growthScore = 12; // stable baseline
  if (trendDirection === 'growing') {
    growthScore = Math.min(25, 12 + Math.round(pctChange / 10));
  } else if (trendDirection === 'declining') {
    growthScore = Math.max(0, 12 + Math.round(pctChange / 10));
  }

  // 3. Geo diversity (0-25)
  const countryCount = (stats.countries || []).length;
  const geoScore = Math.min(25, countryCount * 5);

  // 4. Referrer diversity (0-25)
  const referrerCount = (stats.referrers || []).length;
  const directOnly = referrerCount <= 1 && stats.referrers?.[0]?.name === 'Direct';
  const referrerScore = directOnly ? 5 : Math.min(25, referrerCount * 6);

  const total = velocityScore + growthScore + geoScore + referrerScore;

  return {
    score: Math.min(100, total),
    breakdown: {
      velocity: velocityScore,
      growth: growthScore,
      geo: geoScore,
      referrers: referrerScore,
    },
  };
}

// ─── Tips Engine ────────────────────────────────────────────────────────────

/**
 * Rule engine that generates actionable tips based on data patterns.
 * Each rule checks a condition and returns a tip with an icon and priority.
 */
export function generateTips(stats, trend, audienceProfile) {
  if (!stats || stats.totalClicks === 0) {
    return [{
      icon: '🚀',
      category: 'Getting Started',
      tip: 'Share your first tracking link on social media, email, or messaging apps to start capturing audience insights.',
      priority: 1,
    }];
  }

  const tips = [];
  const devices = stats.devices || {};
  const total = stats.totalClicks || 1;
  const mobilePct = Math.round(((devices.Mobile || 0) / total) * 100);
  const desktopPct = Math.round(((devices.Desktop || 0) / total) * 100);
  const countries = stats.countries || [];
  const referrers = stats.referrers || [];
  const browsers = stats.browsers || [];

  // Mobile dominance
  if (mobilePct >= 60) {
    tips.push({
      icon: 'mobile', category: 'Mobile Optimization', priority: 1,
      tip: `${mobilePct}% of your clicks come from mobile devices. Ensure your landing pages are mobile-first with fast load times, large CTAs, and minimal form fields.`,
    });
  }

  // Desktop dominance
  if (desktopPct >= 60) {
    tips.push({
      icon: '🖥️', category: 'Desktop Experience', priority: 2,
      tip: `${desktopPct}% of clicks are from desktop users. Consider adding rich content, multi-step forms, and detailed product pages that leverage larger screens.`,
    });
  }

  // Geographic concentration
  if (countries.length > 0) {
    const topCountry = countries[0];
    const topCountryPct = Math.round((topCountry.count / total) * 100);
    if (topCountryPct >= 70) {
      tips.push({
        icon: 'geo', category: 'Geo Targeting', priority: 1,
        tip: `${topCountryPct}% of traffic is from ${topCountry.name}. Localize your content, pricing, and messaging for this market to maximize conversions.`,
      });
    } else if (countries.length >= 3) {
      tips.push({
        icon: 'global', category: 'Global Reach', priority: 3,
        tip: `You're reaching ${countries.length} countries. Consider region-specific landing pages or timezone-aware scheduling for posts and emails.`,
      });
    }
  }

  // Direct traffic dominance
  const directRef = referrers.find(r => r.name === 'Direct');
  const directPct = directRef ? Math.round((directRef.count / total) * 100) : 0;
  if (directPct >= 70) {
    tips.push({
      icon: 'link', category: 'Traffic Diversification', priority: 1,
      tip: `${directPct}% of traffic is direct/untracked. Share links on trackable platforms (social media, newsletters, QR codes) to better understand your audience sources.`,
    });
  }

  // Social media referrers
  const socialRefs = referrers.filter(r =>
    /twitter|x\.com|linkedin|facebook|instagram|reddit|tiktok/i.test(r.name)
  );
  if (socialRefs.length > 0) {
    const topSocial = socialRefs[0];
    tips.push({
      icon: 'social', category: 'Social Strategy', priority: 2,
      tip: `${topSocial.name} is your strongest social channel (${topSocial.count} clicks). Double down here with consistent posting and engage your audience with replies and comments.`,
    });
  }

  // Growth trend
  if (trend?.direction === 'growing') {
    tips.push({
      icon: 'trend', category: 'Momentum', priority: 2,
      tip: `Traffic is growing ${Math.abs(trend.percentChange)}% week-over-week. Capitalize on this momentum — increase posting frequency and test new channels while engagement is high.`,
    });
  } else if (trend?.direction === 'declining') {
    tips.push({
      icon: 'spark', category: 'Re-engagement', priority: 1,
      tip: `Traffic has declined ${Math.abs(trend.percentChange)}%. Re-engage your audience with fresh content, new link destinations, or reach out to past clickers via email.`,
    });
  }

  // Low click volume
  if (total < 10) {
    tips.push({
      icon: 'target', category: 'Early Growth', priority: 1,
      tip: 'You\'re in the early stages. Focus on sharing links in 2-3 specific communities where your target audience hangs out, rather than broadcasting everywhere.',
    });
  }

  // Browser diversity insights
  if (browsers.length > 0) {
    const chromePct = browsers.find(b => /chrome/i.test(b.name));
    const safariPct = browsers.find(b => /safari/i.test(b.name));
    if (safariPct && safariPct.count > (chromePct?.count || 0)) {
      tips.push({
        icon: '🍎', category: 'Apple Ecosystem', priority: 3,
        tip: 'Safari dominates your browser mix, indicating strong Apple/iOS user presence. Optimize for iOS-native sharing (AirDrop, iMessage) and consider Apple-specific landing features.',
      });
    }
  }

  // Multiple links performing well
  if (stats.topLinks && stats.topLinks.length > 1) {
    const topLink = stats.topLinks[0];
    const secondLink = stats.topLinks[1];
    if (topLink.count > 0 && secondLink.count > 0 && secondLink.count >= topLink.count * 0.5) {
      tips.push({
        icon: '📊', category: 'A/B Testing', priority: 2,
        tip: `Multiple links are performing well. Run A/B tests with different slugs, CTAs, and destinations to find what resonates most with your audience.`,
      });
    }
  }

  // Referrer optimization
  if (referrers.length >= 3 && !socialRefs.length) {
    tips.push({
      icon: '🔍', category: 'Channel Discovery', priority: 3,
      tip: 'Your traffic comes from multiple non-social sources. Identify which channels have the highest engagement quality and invest more in those.',
    });
  }

  // Tablet traffic
  if ((devices.Tablet || 0) / total > 0.1) {
    tips.push({
      icon: '📋', category: 'Tablet UX', priority: 3,
      tip: `${Math.round((devices.Tablet / total) * 100)}% of clicks are from tablets. Ensure your landing pages are responsive for mid-size screens with touch-friendly navigation.`,
    });
  }

  // Sort by priority and return top 5
  return tips.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

// ─── Time Pattern Analysis ──────────────────────────────────────────────────

/**
 * Analyzes click timestamps to find peak hours, peak days, and build heatmap data.
 */
export function computeTimePatterns(recentClicks) {
  if (!recentClicks || recentClicks.length === 0) {
    return { peakHour: null, peakDay: null, hourly: new Array(24).fill(0), daily: new Array(7).fill(0) };
  }

  const hourly = new Array(24).fill(0);
  const daily = new Array(7).fill(0);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  recentClicks.forEach(click => {
    const d = new Date(click.timestamp);
    if (!isNaN(d.getTime())) {
      hourly[d.getHours()]++;
      daily[d.getDay()]++;
    }
  });

  const peakHourIdx = hourly.indexOf(Math.max(...hourly));
  const peakDayIdx = daily.indexOf(Math.max(...daily));

  // Format peak hour as readable range
  const peakHourStart = peakHourIdx;
  const peakHourEnd = (peakHourIdx + 1) % 24;
  const formatHour = (h) => {
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  };

  return {
    peakHour: peakHourIdx,
    peakHourLabel: `${formatHour(peakHourStart)} – ${formatHour(peakHourEnd)}`,
    peakDay: dayNames[peakDayIdx],
    peakDayIdx,
    hourly,
    daily,
    dayNames,
  };
}

// ─── Anomaly Detection ──────────────────────────────────────────────────────

/**
 * Detects anomalies (spikes/drops) in the last 7 days using z-score deviation.
 */
export function detectAnomalies(chartData) {
  const { labels, data } = chartData || {};
  if (!data || data.length < 7) return [];

  // Calculate mean and standard deviation of the full 30-day window
  const n = data.length;
  const mean = data.reduce((s, v) => s + v, 0) / n;
  const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return []; // Flat data, no anomalies

  const anomalies = [];
  const threshold = 1.8; // z-score threshold

  // Check last 7 days only
  for (let i = Math.max(0, n - 7); i < n; i++) {
    const zScore = (data[i] - mean) / stdDev;
    if (Math.abs(zScore) >= threshold) {
      anomalies.push({
        date: labels[i],
        value: data[i],
        expected: Math.round(mean),
        zScore: Math.round(zScore * 100) / 100,
        type: zScore > 0 ? 'spike' : 'drop',
        magnitude: Math.round(Math.abs(zScore) * 10) / 10,
      });
    }
  }

  return anomalies;
}

// ─── Predictive Forecast ────────────────────────────────────────────────────

/**
 * Forecasts the next N days of clicks using weighted moving average + linear trend.
 */
export function forecastClicks(chartData, days = 7) {
  const { labels, data } = chartData || {};
  if (!data || data.length < 3) {
    return { forecast: [], confidence: 'low' };
  }

  // Weighted moving average of last 7 days (more weight on recent)
  const window = data.slice(-7);
  const weights = [1, 1, 2, 2, 3, 4, 5];
  const effectiveWeights = weights.slice(-window.length);
  const totalWeight = effectiveWeights.reduce((s, w) => s + w, 0);
  const wma = effectiveWeights.reduce((s, w, i) => s + w * window[i], 0) / totalWeight;

  // Linear trend from the last 14 days
  const trendWindow = data.slice(-14);
  const trendN = trendWindow.length;
  const txMean = (trendN - 1) / 2;
  const tyMean = trendWindow.reduce((s, v) => s + v, 0) / trendN;
  let tNum = 0, tDen = 0;
  for (let i = 0; i < trendN; i++) {
    tNum += (i - txMean) * (trendWindow[i] - tyMean);
    tDen += (i - txMean) ** 2;
  }
  const trendSlope = tDen !== 0 ? tNum / tDen : 0;

  // Generate forecast
  const forecast = [];
  const lastDate = new Date(labels[labels.length - 1]);

  for (let i = 1; i <= days; i++) {
    const forecastDate = new Date(lastDate.getTime() + i * 24 * 60 * 60 * 1000);
    const predicted = Math.max(0, Math.round(wma + trendSlope * i));
    forecast.push({
      date: forecastDate.toISOString().split('T')[0],
      predicted,
    });
  }

  // Confidence level based on data volume and variance
  const variance = data.reduce((s, v) => s + (v - tyMean) ** 2, 0) / data.length;
  const cv = tyMean > 0 ? Math.sqrt(variance) / tyMean : 1;
  const confidence = cv < 0.3 ? 'high' : cv < 0.7 ? 'medium' : 'low';

  return { forecast, confidence };
}

// ─── Smart Slug Suggester ───────────────────────────────────────────────────

/**
 * Generates 5 smart slug suggestions from a destination URL.
 * No API call — uses URL parsing and keyword extraction.
 */
export function suggestSlugs(destinationUrl) {
  if (!destinationUrl) return [];

  let url;
  try {
    url = new URL(destinationUrl.startsWith('http') ? destinationUrl : `https://${destinationUrl}`);
  } catch {
    return [];
  }

  const suggestions = new Set();

  // Extract meaningful parts from the URL
  const domain = url.hostname.replace(/^www\./, '').split('.')[0];
  const pathParts = url.pathname
    .split('/')
    .filter(p => p.length > 0 && p.length < 30)
    .map(p => p.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase())
    .filter(p => p.length > 1);

  // Strategy 1: Domain-based short slug
  if (domain.length >= 2 && domain.length <= 15) {
    suggestions.add(domain);
  }

  // Strategy 2: Path-based slugs
  if (pathParts.length > 0) {
    const lastSegment = pathParts[pathParts.length - 1];
    if (lastSegment.length >= 2 && lastSegment.length <= 25) {
      suggestions.add(lastSegment);
    }
    // Combine domain + last segment
    if (domain && lastSegment && `${domain}-${lastSegment}`.length <= 25) {
      suggestions.add(`${domain}-${lastSegment}`);
    }
  }

  // Strategy 3: Abbreviated slug
  if (pathParts.length >= 2) {
    const abbrev = pathParts.map(p => p.slice(0, 4)).join('-');
    if (abbrev.length >= 3 && abbrev.length <= 20) {
      suggestions.add(abbrev);
    }
  }

  // Strategy 4: Domain + keyword combos
  const actionWords = ['go', 'get', 'try', 'view', 'see', 'check'];
  const randomAction = actionWords[Math.floor(Math.random() * actionWords.length)];
  if (domain) {
    suggestions.add(`${randomAction}-${domain}`);
  }

  // Strategy 5: Short memorable with date/random suffix
  const shortSuffix = Math.random().toString(36).substring(2, 5);
  if (domain) {
    suggestions.add(`${domain}-${shortSuffix}`);
  }
  if (pathParts.length > 0) {
    suggestions.add(`${pathParts[0]}-${shortSuffix}`);
  }

  // Ensure all slugs are clean
  return Array.from(suggestions)
    .map(s => s.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase())
    .filter(s => s.length >= 2 && s.length <= 30)
    .slice(0, 5);
}

// ─── Per-Link Performance Grading ───────────────────────────────────────────

/**
 * Grades each link's performance on an A-F scale.
 */
export function gradeLinkPerformance(links, stats) {
  if (!links || !stats || !stats.topLinks) return {};

  const totalClicks = stats.totalClicks || 1;
  const avgClicksPerLink = totalClicks / Math.max(links.length, 1);

  const grades = {};
  links.forEach(link => {
    const linkStat = stats.topLinks.find(tl => tl.slug === link.slug);
    const clicks = linkStat?.count || 0;

    // Scoring: compare to average
    const ratio = avgClicksPerLink > 0 ? clicks / avgClicksPerLink : 0;

    let grade, color, reason;
    if (ratio >= 2) {
      grade = 'A'; color = '#34d399';
      reason = 'Outstanding — significantly above average traffic';
    } else if (ratio >= 1.2) {
      grade = 'B+'; color = '#6ee7b7';
      reason = 'Strong performer — above average traffic';
    } else if (ratio >= 0.8) {
      grade = 'B'; color = '#93c5fd';
      reason = 'Solid — performing at expected levels';
    } else if (ratio >= 0.4) {
      grade = 'C'; color = '#fbbf24';
      reason = 'Below average — consider refreshing or re-sharing';
    } else if (clicks > 0) {
      grade = 'D'; color = '#fb923c';
      reason = 'Low engagement — may need new distribution channels';
    } else {
      grade = 'F'; color = '#f87171';
      reason = 'No clicks recorded — share this link to start tracking';
    }

    grades[link.slug] = { grade, color, reason, clicks, ratio: Math.round(ratio * 100) / 100 };
  });

  return grades;
}

// ─── Engagement Velocity ────────────────────────────────────────────────────

/**
 * Compares click rate in the last 24 hours vs the previous 24 hours.
 * Returns a momentum indicator — are clicks accelerating or cooling?
 */
export function computeEngagementVelocity(recentClicks) {
  if (!recentClicks || recentClicks.length === 0) {
    return { current24h: 0, previous24h: 0, delta: 0, direction: 'flat', label: 'No data yet' };
  }

  const now = Date.now();
  const h24 = 24 * 60 * 60 * 1000;

  const current24h = recentClicks.filter(c => now - new Date(c.timestamp).getTime() < h24).length;
  const previous24h = recentClicks.filter(c => {
    const age = now - new Date(c.timestamp).getTime();
    return age >= h24 && age < 2 * h24;
  }).length;

  let delta = 0;
  if (previous24h > 0) {
    delta = Math.round(((current24h - previous24h) / previous24h) * 100);
  } else if (current24h > 0) {
    delta = 100;
  }

  let direction, label, color;
  if (delta >= 20) {
    direction = 'accelerating'; label = `Accelerating +${delta}%`; color = '#34d399';
  } else if (delta >= 0) {
    direction = 'steady'; label = `Steady ${delta > 0 ? '+' + delta : delta}%`; color = '#93c5fd';
  } else if (delta > -30) {
    direction = 'cooling'; label = `Cooling ${delta}%`; color = '#fbbf24';
  } else {
    direction = 'dropped'; label = `Dropped ${delta}%`; color = '#f87171';
  }

  return { current24h, previous24h, delta, direction, label, color };
}

// ─── Link Lifecycle & Decay Detection ──────────────────────────────────────

/**
 * For each link, calculates its age and click velocity decay.
 * Detects "sleeping" links that had traction but went silent.
 */
export function computeLinkLifecycle(links, recentClicks) {
  if (!links || links.length === 0 || !recentClicks) return [];

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  return links.map(link => {
    const ageMs = now - new Date(link.createdAt).getTime();
    const ageDays = Math.max(1, Math.floor(ageMs / day));

    const linkClicks = recentClicks.filter(c => c.slug === link.slug);
    const totalClicks = linkClicks.length;

    // Split clicks into first half of life vs second half
    const halfLife = ageDays / 2;
    const earlyClicks = linkClicks.filter(c => {
      const clickAge = (now - new Date(c.timestamp).getTime()) / day;
      return clickAge > halfLife;
    }).length;
    const recentClickCount = linkClicks.filter(c => {
      const clickAge = (now - new Date(c.timestamp).getTime()) / day;
      return clickAge <= halfLife;
    }).length;

    // Last 7 days
    const last7d = linkClicks.filter(c => now - new Date(c.timestamp).getTime() < 7 * day).length;
    const last24h = linkClicks.filter(c => now - new Date(c.timestamp).getTime() < day).length;

    const clicksPerDay = totalClicks / ageDays;

    // Detect lifecycle stage
    let stage, stageColor, stageDesc;
    if (totalClicks === 0) {
      stage = 'untouched'; stageColor = '#71717a'; stageDesc = 'Never clicked — needs distribution';
    } else if (ageDays <= 3 && last24h > 0) {
      stage = 'launch'; stageColor = '#34d399'; stageDesc = 'Fresh link gaining traction';
    } else if (earlyClicks > 0 && recentClickCount === 0 && ageDays > 7) {
      stage = 'faded'; stageColor = '#f59e0b'; stageDesc = 'Had traffic — now silent. Re-share it';
    } else if (last7d > 0 && clicksPerDay >= 0.5) {
      stage = 'active'; stageColor = '#60a5fa'; stageDesc = 'Consistently receiving clicks';
    } else if (last7d === 0 && totalClicks > 3) {
      stage = 'dormant'; stageColor = '#fb923c'; stageDesc = 'Traffic has stopped — consider re-promoting';
    } else {
      stage = 'slow'; stageColor = '#a1a1aa'; stageDesc = 'Receiving some clicks but low velocity';
    }

    return {
      slug: link.slug,
      ageDays,
      totalClicks,
      clicksPerDay: Math.round(clicksPerDay * 10) / 10,
      last7d,
      last24h,
      stage,
      stageColor,
      stageDesc,
    };
  }).sort((a, b) => b.totalClicks - a.totalClicks);
}

// ─── Traffic Quality Score ──────────────────────────────────────────────────

/**
 * Measures the richness and health of traffic beyond raw volume.
 * High quality = diverse sources, multiple geos, multiple browsers, regular cadence.
 */
export function computeTrafficQualityScore(stats) {
  if (!stats || stats.totalClicks === 0) {
    return { score: 0, signals: [], label: 'No traffic to score' };
  }

  const signals = [];
  let score = 0;

  // 1. Source diversity (not all direct) — 0-20
  const directPct = (() => {
    const d = (stats.referrers || []).find(r => r.name === 'Direct');
    return d ? (d.count / stats.totalClicks) : 0;
  })();
  const sourceScore = Math.round((1 - directPct) * 20);
  score += sourceScore;
  signals.push({
    label: 'Source Diversity',
    value: sourceScore,
    max: 20,
    note: directPct < 0.5 ? 'Good mix of referral sources' : 'Mostly direct — add UTM tracking',
    positive: directPct < 0.5,
  });

  // 2. Geographic spread — 0-20
  const geoCount = (stats.countries || []).length;
  const geoScore = Math.min(20, geoCount * 4);
  score += geoScore;
  signals.push({
    label: 'Geo Spread',
    value: geoScore,
    max: 20,
    note: geoCount >= 3 ? `${geoCount} countries reaching you` : 'Concentrated in few regions',
    positive: geoCount >= 3,
  });

  // 3. Consistent daily cadence — 0-20
  const nonZeroDays = (stats.chart?.data || []).filter(d => d > 0).length;
  const cadenceScore = Math.round((nonZeroDays / 30) * 20);
  score += cadenceScore;
  signals.push({
    label: 'Consistent Cadence',
    value: cadenceScore,
    max: 20,
    note: nonZeroDays >= 10 ? `Traffic on ${nonZeroDays}/30 days` : 'Sporadic traffic pattern',
    positive: nonZeroDays >= 10,
  });

  // 4. Multi-device reach — 0-20
  const deviceTypes = Object.values(stats.devices || {}).filter(v => v > 0).length;
  const deviceScore = Math.min(20, deviceTypes * 7);
  score += deviceScore;
  signals.push({
    label: 'Multi-Device',
    value: deviceScore,
    max: 20,
    note: deviceTypes >= 2 ? `Reaching ${deviceTypes} device types` : 'Single device type only',
    positive: deviceTypes >= 2,
  });

  // 5. Traffic volume relative to link count — 0-20
  const clicksPerLink = stats.totalLinks > 0 ? stats.totalClicks / stats.totalLinks : 0;
  const volumeScore = Math.min(20, Math.round(clicksPerLink * 2));
  score += volumeScore;
  signals.push({
    label: 'Link Efficiency',
    value: volumeScore,
    max: 20,
    note: clicksPerLink >= 5 ? `~${Math.round(clicksPerLink)} clicks/link avg` : 'Low clicks per link — needs more sharing',
    positive: clicksPerLink >= 5,
  });

  const label = score >= 70 ? 'Excellent' : score >= 50 ? 'Good' : score >= 30 ? 'Needs Work' : 'Poor';
  return { score: Math.min(100, score), signals, label };
}

// ─── Virality Signal ────────────────────────────────────────────────────────

/**
 * Estimates organic virality by looking at referrer patterns.
 * If traffic comes from multiple distinct social sources without direct campaign effort,
 * it suggests the content is being shared organically.
 */
export function computeViralitySignal(stats, recentClicks) {
  if (!stats || stats.totalClicks < 5) {
    return { score: 0, level: 'none', indicators: [], explanation: 'Not enough data to measure virality.' };
  }

  const indicators = [];
  let score = 0;

  // 1. Multiple social referrers (organic spread)
  const socialRefs = (stats.referrers || []).filter(r =>
    /twitter|x\.com|linkedin|facebook|instagram|reddit|tiktok|whatsapp|telegram/i.test(r.name)
  );
  if (socialRefs.length >= 3) { score += 30; indicators.push({ label: `${socialRefs.length} social platforms sharing`, positive: true }); }
  else if (socialRefs.length >= 1) { score += 15; indicators.push({ label: `${socialRefs.length} social platform detected`, positive: true }); }

  // 2. Geographic spread speed (many countries quickly)
  const geoCount = (stats.countries || []).length;
  if (geoCount >= 5) { score += 25; indicators.push({ label: `Spreading across ${geoCount} countries`, positive: true }); }
  else if (geoCount >= 3) { score += 12; indicators.push({ label: `Reaching ${geoCount} countries`, positive: true }); }

  // 3. Spike in recent clicks (viral moment)
  const last7 = (stats.chart?.data || []).slice(-7);
  const prev7 = (stats.chart?.data || []).slice(-14, -7);
  const lastAvg = last7.reduce((s, v) => s + v, 0) / 7;
  const prevAvg = prev7.reduce((s, v) => s + v, 0) / 7;
  if (prevAvg > 0 && lastAvg / prevAvg >= 2) {
    score += 25; indicators.push({ label: `${Math.round(lastAvg / prevAvg)}x traffic surge this week`, positive: true });
  }

  // 4. Diverse device spread (shared across different people's devices)
  const deviceTypes = Object.values(stats.devices || {}).filter(v => v > 0).length;
  if (deviceTypes >= 3) { score += 20; indicators.push({ label: 'Traffic across 3+ device types', positive: true }); }

  const level = score >= 70 ? 'high' : score >= 40 ? 'medium' : score >= 15 ? 'emerging' : 'none';
  const explanation = {
    high: 'Strong viral signals detected. Your content is being shared organically across multiple platforms and regions.',
    medium: 'Moderate viral potential. Traffic is diversifying — encourage further sharing to amplify.',
    emerging: 'Early sharing signals. A targeted push on 1-2 channels could trigger a viral loop.',
    none: 'Traffic is mostly driven by direct sharing. Try adding social share CTAs on landing pages.',
  }[level];

  return { score: Math.min(100, score), level, indicators, explanation };
}

// ─── Content Calendar Recommendation ───────────────────────────────────────

/**
 * Uses hourly and daily click patterns to recommend an optimal posting schedule.
 */
export function buildContentCalendar(timePatterns) {
  if (!timePatterns || timePatterns.peakHour === null) {
    return {
      slots: [],
      summary: 'Not enough data yet. Share your links and check back once you have 10+ clicks.',
    };
  }

  const { hourly, daily, dayNames } = timePatterns;
  const maxHourly = Math.max(...hourly, 1);
  const maxDaily = Math.max(...daily, 1);

  // Find top 3 posting times
  const topHours = hourly
    .map((count, i) => ({ hour: i, count, score: count / maxHourly }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const topDays = daily
    .map((count, i) => ({ day: dayNames[i], dayIdx: i, count, score: count / maxDaily }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const formatHour = (h) => {
    if (h === 0) return '12:00 AM';
    if (h < 12) return `${h}:00 AM`;
    if (h === 12) return '12:00 PM';
    return `${h - 12}:00 PM`;
  };

  // Build posting slots combining top days + top times
  const slots = [];
  topDays.slice(0, 2).forEach(d => {
    topHours.slice(0, 2).forEach(h => {
      slots.push({
        day: d.day,
        time: formatHour(h.hour),
        strength: Math.round(((d.score + h.score) / 2) * 100),
        label: d.score >= 0.8 && h.score >= 0.8 ? 'Prime Slot' : 'Good Slot',
      });
    });
  });

  // Sort by strength
  slots.sort((a, b) => b.strength - a.strength);

  const bestDay = topDays[0]?.day || 'N/A';
  const bestHour = formatHour(topHours[0]?.hour || 0);

  return {
    slots: slots.slice(0, 4),
    bestDay,
    bestHour,
    summary: `Best time to share: ${bestDay}s around ${bestHour} for maximum engagement.`,
  };
}

// ─── Lead Quality Score Per Link ────────────────────────────────────────────

/**
 * Assigns a lead quality score to each link based on click recency,
 * geographic diversity, and referrer quality.
 */
export function computeLeadQualityPerLink(links, recentClicks, stats) {
  if (!links || !recentClicks || links.length === 0) return {};

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const result = {};

  links.forEach(link => {
    const linkClicks = recentClicks.filter(c => c.slug === link.slug);
    if (linkClicks.length === 0) {
      result[link.slug] = { score: 0, label: 'No data', color: '#52525b', factors: [] };
      return;
    }

    const factors = [];
    let score = 0;

    // Recency (0-30): more recent = higher quality leads
    const recentCount = linkClicks.filter(c => now - new Date(c.timestamp).getTime() < 7 * day).length;
    const recencyScore = Math.min(30, Math.round((recentCount / linkClicks.length) * 30));
    score += recencyScore;
    factors.push({ label: 'Recency', value: recencyScore, max: 30 });

    // Geo diversity (0-30): leads from multiple regions = higher quality audience
    const geos = new Set(linkClicks.map(c => c.country).filter(Boolean));
    const geoScore = Math.min(30, geos.size * 8);
    score += geoScore;
    factors.push({ label: 'Geo Range', value: geoScore, max: 30 });

    // Referrer quality (0-25): known platforms > direct
    const hasQualityRef = linkClicks.some(c => c.referrer && c.referrer !== 'Direct' && c.referrer.length > 3);
    const refScore = hasQualityRef ? 25 : 8;
    score += refScore;
    factors.push({ label: 'Source Quality', value: refScore, max: 25 });

    // Volume signal (0-15)
    const volumeScore = Math.min(15, linkClicks.length * 2);
    score += volumeScore;
    factors.push({ label: 'Volume', value: volumeScore, max: 15 });

    const total = Math.min(100, score);
    const label = total >= 70 ? 'Hot Leads' : total >= 50 ? 'Warm' : total >= 30 ? 'Lukewarm' : 'Cold';
    const color = total >= 70 ? '#34d399' : total >= 50 ? '#60a5fa' : total >= 30 ? '#fbbf24' : '#71717a';

    result[link.slug] = { score: total, label, color, factors };
  });

  return result;
}

// ─── Session Estimation ─────────────────────────────────────────────────────

/**
 * Estimates unique visitor count by clustering clicks from same IP within a time window.
 * Also computes estimated return visit rate.
 */
export function estimateSessions(recentClicks) {
  if (!recentClicks || recentClicks.length === 0) {
    return { estimated: 0, returnRate: 0, avgSessionGap: null, singleVisitPct: 100 };
  }

  // Group by IP (if available)
  const byIp = {};
  let noIpCount = 0;
  recentClicks.forEach(c => {
    if (!c.ip) { noIpCount++; return; }
    if (!byIp[c.ip]) byIp[c.ip] = [];
    byIp[c.ip].push(new Date(c.timestamp).getTime());
  });

  const uniqueIps = Object.keys(byIp).length;
  const totalTracked = uniqueIps + noIpCount;

  // Estimate sessions: group clicks from same IP within 30-min window as one session
  let totalSessions = noIpCount; // each no-IP click is its own session
  let returnVisitors = 0;
  const gaps = [];

  Object.values(byIp).forEach(timestamps => {
    timestamps.sort((a, b) => a - b);
    let sessions = 1;
    for (let i = 1; i < timestamps.length; i++) {
      const gap = timestamps[i] - timestamps[i - 1];
      if (gap > 30 * 60 * 1000) { // 30 min gap = new session
        sessions++;
        gaps.push(gap);
      }
    }
    totalSessions += sessions;
    if (sessions > 1) returnVisitors++;
  });

  const avgGapMs = gaps.length > 0 ? gaps.reduce((s, v) => s + v, 0) / gaps.length : null;
  const returnRate = uniqueIps > 0 ? Math.round((returnVisitors / uniqueIps) * 100) : 0;
  const singleVisitPct = uniqueIps > 0
    ? Math.round(((uniqueIps - returnVisitors) / uniqueIps) * 100)
    : 100;

  return {
    estimated: totalSessions,
    uniqueIpCount: uniqueIps,
    returnVisitors,
    returnRate,
    avgSessionGapHours: avgGapMs ? Math.round(avgGapMs / (1000 * 60 * 60) * 10) / 10 : null,
    singleVisitPct,
  };
}

// ─── Platform Intelligence ──────────────────────────────────────────────────

/**
 * Infers likely distribution platforms from device+referrer+time combos.
 * Even "Direct" traffic carries platform signals (e.g., iOS+Mobile+evening = iMessage/WhatsApp).
 */
export function inferPlatformIntelligence(recentClicks) {
  if (!recentClicks || recentClicks.length === 0) {
    return { platforms: [], dominantPlatform: null, confidence: 'low' };
  }

  const signals = { LinkedIn: 0, Twitter: 0, WhatsApp: 0, Email: 0, Instagram: 0, Reddit: 0, Organic: 0 };

  recentClicks.forEach(c => {
    const ref = (c.referrer || '').toLowerCase();
    const device = (c.device || '').toLowerCase();
    const browser = (c.browser || '').toLowerCase();
    const hour = new Date(c.timestamp).getHours();

    // Direct referrer signals
    if (/linkedin/i.test(ref)) signals.LinkedIn += 2;
    if (/twitter|x\.com/i.test(ref)) signals.Twitter += 2;
    if (/facebook|instagram/i.test(ref)) signals.Instagram += 2;
    if (/reddit/i.test(ref)) signals.Reddit += 2;
    if (/whatsapp|t\.me|telegram/i.test(ref)) signals.WhatsApp += 2;
    if (/mail|gmail|outlook|yahoo/i.test(ref)) signals.Email += 2;

    // Inferred signals from device+time combos
    if (ref === 'Direct' || !ref) {
      // Professional hours + desktop = likely LinkedIn/Email
      if (device === 'desktop' && hour >= 8 && hour <= 18) {
        signals.LinkedIn += 0.5;
        signals.Email += 0.5;
      }
      // Evening + mobile = WhatsApp/iMessage
      if (device === 'mobile' && (hour >= 19 || hour <= 8)) {
        signals.WhatsApp += 0.5;
      }
      // Safari on mobile = likely iMessage or iOS apps
      if (/safari/i.test(browser) && device === 'mobile') {
        signals.WhatsApp += 0.3;
      }
    }
  });

  const total = Object.values(signals).reduce((s, v) => s + v, 0);
  if (total === 0) return { platforms: [], dominantPlatform: null, confidence: 'low' };

  const platforms = Object.entries(signals)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, strength]) => ({
      name,
      strength: Math.round((strength / total) * 100),
      emoji: { LinkedIn: 'LI', Twitter: 'TW', WhatsApp: 'WA', Email: 'EM', Instagram: 'IG', Reddit: 'RD', Organic: 'OR' }[name] || '--',
    }))
    .slice(0, 5);

  const dominantPlatform = platforms[0]?.name || null;
  const confidence = platforms[0]?.strength >= 50 ? 'high' : platforms[0]?.strength >= 25 ? 'medium' : 'low';

  return { platforms, dominantPlatform, confidence };
}

// ─── ISP & Network Intelligence ────────────────────────────────────────────

/**
 * Analyzes ISP data to distinguish corporate vs residential vs mobile traffic.
 * Corporate traffic = high-intent B2B leads.
 */
export function analyzeNetworkIntelligence(recentClicks) {
  if (!recentClicks || recentClicks.length === 0) {
    return { corporate: 0, mobile: 0, residential: 0, topISPs: [], b2bSignal: 0 };
  }

  const ispCounts = {};
  let corporate = 0, mobile = 0, residential = 0;

  const mobileKeywords = /verizon|t-mobile|at&t|sprint|boost|cricket|metro|telus|rogers|bell|vodafone|o2|ee mobile|three/i;
  const corporateKeywords = /amazon|google|microsoft|cloudflare|digitalocean|linode|github|salesforce|zoom|slack|oracle|ibm|sap/i;

  recentClicks.forEach(c => {
    const isp = c.isp || 'Unknown';
    if (isp !== 'Unknown') {
      ispCounts[isp] = (ispCounts[isp] || 0) + 1;
    }

    if (mobileKeywords.test(isp)) mobile++;
    else if (corporateKeywords.test(isp)) corporate++;
    else residential++;
  });

  const total = recentClicks.length;
  const topISPs = Object.entries(ispCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }));

  const b2bSignal = Math.min(100, Math.round((corporate / Math.max(total, 1)) * 100 * 3));

  return {
    corporate,
    mobile,
    residential,
    corporatePct: Math.round((corporate / Math.max(total, 1)) * 100),
    mobilePct: Math.round((mobile / Math.max(total, 1)) * 100),
    residentialPct: Math.round((residential / Math.max(total, 1)) * 100),
    topISPs,
    b2bSignal,
  };
}

// ─── Master Orchestrator ────────────────────────────────────────────────────

/**
 * Runs all local analysis engines and returns the complete intelligence report.
 * Zero API cost — pure computation.
 */
export function buildFullAnalysis(stats, links) {
  const clicks = stats?.recentClicks || [];

  const trend = computeTrend(stats?.chart);
  const audienceProfile = computeAudienceProfile(stats);
  const opportunityScore = computeOpportunityScore(stats, trend);
  const tips = generateTips(stats, trend, audienceProfile);
  const timePatterns = computeTimePatterns(clicks);
  const anomalies = detectAnomalies(stats?.chart);
  const forecast = forecastClicks(stats?.chart);
  const linkGrades = gradeLinkPerformance(links, stats);

  // New deeper analysis
  const engagementVelocity = computeEngagementVelocity(clicks);
  const linkLifecycle = computeLinkLifecycle(links, clicks);
  const trafficQuality = computeTrafficQualityScore(stats);
  const viralitySignal = computeViralitySignal(stats, clicks);
  const contentCalendar = buildContentCalendar(timePatterns);
  const leadQuality = computeLeadQualityPerLink(links, clicks, stats);
  const sessionEstimate = estimateSessions(clicks);
  const platformIntelligence = inferPlatformIntelligence(clicks);
  const networkIntelligence = analyzeNetworkIntelligence(clicks);

  return {
    trend,
    audienceProfile,
    opportunityScore,
    tips,
    timePatterns,
    anomalies,
    forecast,
    linkGrades,
    // Deep analysis
    engagementVelocity,
    linkLifecycle,
    trafficQuality,
    viralitySignal,
    contentCalendar,
    leadQuality,
    sessionEstimate,
    platformIntelligence,
    networkIntelligence,
    generatedAt: new Date().toISOString(),
  };
}

