(() => {
  "use strict";

  const CONFIG = {
    spreadsheetId: "1KDyg_gHPK7vT1PEQq2xkzP1b9XBB7ZCK0IS_b_oLcQM",
    youtubePlaylistId: "PLa2KnnpQwi4R1iJ7amDjVejvHbw9Szety",
    timeoutMs: 9000,
    refreshBucketMs: 5 * 60 * 1000,
    videoRefreshMs: 48 * 60 * 60 * 1000,
    sheets: {
      champions: "Championship Tracker",
      rankings: "Power Rankings",
      matchDatabase: "Match Database",
      mnjRoster: "Monday Night Jabs Roster",
      wedRoster: "Walk-Em Down Wednesday Roster",
      fnfRoster: "Friday Night Fades Roster",
      teams: "Teams / Stables",
      snsRecap: "Saturday Night Shakedown Recap"
    }
  };

  const CHAMPIONSHIP_IMAGES = {
    "unprovoked heavyweight championship": "assets/logos/monday-night-jabs.webp",
    "unprovoked chaos championship": "assets/champions/zooo-oom-chaos.jpeg",
    "walk em down championship": "assets/champions/renny-waves-wed.jpeg",
    "southern internet championship": "assets/champions/xrockstar-southern.jpeg",
    "unprovoked tag team championship": "assets/champions/tru-kingz-tag.jpeg"
  };

  const CHAMPIONSHIP_FALLBACKS = [
    {
      title: "Unprovoked Heavyweight Championship",
      show: "Monday Night Jabs",
      champion: "B-Wilder",
      defenses: "0"
    },
    {
      title: "Unprovoked Chaos Championship",
      show: "Monday Night Jabs",
      champion: "ZoOo_Oom",
      defenses: "0"
    },
    {
      title: "Walk-Em Down Championship",
      show: "Walk-Em Down Wednesdays",
      champion: "Renny_Waves",
      defenses: "1"
    },
    {
      title: "Southern Internet Championship",
      show: "Walk-Em Down Wednesdays",
      champion: "xRockstar901x",
      defenses: "1"
    },
    {
      title: "Unprovoked Tag-Team Championship",
      show: "Friday Night Fades",
      champion: "BabyboyJacksonJr & M0ney_T510",
      defenses: "0"
    }
  ];

  const state = {
    championNames: new Set()
  };

  const $ = (selector, root = document) => root.querySelector(selector);

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[#?()/%+.-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function clean(value) {
    return String(value ?? "").trim();
  }

  function get(row, labels) {
    for (const label of labels) {
      const wanted = normalize(label);
      const key = Object.keys(row).find((candidate) => normalize(candidate) === wanted);
      if (key && clean(row[key])) return clean(row[key]);
    }
    return "";
  }

  function numberValue(value, fallback = 0) {
    const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function matchIdNumber(value) {
    const match = clean(value).match(/(\d+)(?!.*\d)/);
    return match ? Number(match[1]) : -1;
  }

  function sheetUrl(sheetName, range) {
    const cacheBust = Math.floor(Date.now() / CONFIG.refreshBucketMs);
    const encodedSheet = encodeURIComponent(sheetName);
    const encodedRange = range ? `&range=${encodeURIComponent(range)}` : "";
    return `https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodedSheet}${encodedRange}&cache=${cacheBust}`;
  }

  async function fetchSheetText(sheetName, range = "") {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CONFIG.timeoutMs);

    try {
      const response = await fetch(sheetUrl(sheetName, range), {
        signal: controller.signal,
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`Sheet request failed: ${sheetName}`);
      }

      const text = await response.text();
      const jsonStart = text.indexOf("(");
      const jsonEnd = text.lastIndexOf(")");
      if (jsonStart < 0 || jsonEnd < 0) {
        throw new Error(`Unexpected sheet response: ${sheetName}`);
      }

      return JSON.parse(text.slice(jsonStart + 1, jsonEnd));
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function fetchSheet(sheetName) {
    const payload = await fetchSheetText(sheetName);
    const labels = payload.table.cols.map((column, index) => clean(column.label || column.id || `Column ${index + 1}`));

    return payload.table.rows
      .map((row) => {
        const record = {};
        labels.forEach((label, index) => {
          const cell = row.c[index];
          record[label] = cell ? clean(cell.f ?? cell.v ?? "") : "";
        });
        return record;
      })
      .filter((row) => Object.values(row).some(Boolean));
  }

  async function fetchSheetGrid(sheetName, range) {
    const payload = await fetchSheetText(sheetName, range);
    return payload.table.rows
      .map((row) => payload.table.cols.map((_, index) => {
        const cell = row.c[index];
        return cell ? clean(cell.f ?? cell.v ?? "") : "";
      }))
      .filter((row) => row.some(Boolean));
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showClass(show) {
    const value = normalize(show);
    if (value.includes("walk")) return "title-teal";
    if (value.includes("friday") || value.includes("tag")) return "title-green";
    if (value.includes("saturday")) return "title-purple";
    return "title-red";
  }

  function boardClass(show) {
    const value = normalize(show);
    if (value.includes("walk")) return "wed-title";
    if (value.includes("friday") || value.includes("tag")) return "fnf-title";
    return "mnj-title";
  }

  function getImageForTitle(title) {
    return CHAMPIONSHIP_IMAGES[normalize(title)] || "assets/logos/ujwf-federation.webp";
  }

  function normalizeTitle(title) {
    const value = clean(title);
    if (normalize(value) === "unprovoked chaos champion") return "Unprovoked Chaos Championship";
    if (normalize(value) === "southern internet champion") return "Southern Internet Championship";
    return value;
  }

  function groupChampions(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      const rawTitle = get(row, ["Title", "Championship", "Championship Title"]);
      const title = normalizeTitle(rawTitle);
      if (!title) return;

      if (!groups.has(title)) groups.set(title, []);
      groups.get(title).push(row);
    });

    if (!groups.size) {
      CHAMPIONSHIP_FALLBACKS.forEach((fallback) => groups.set(fallback.title, [fallback]));
    }

    return CHAMPIONSHIP_FALLBACKS.map((fallback) => {
      const rowsForTitle = groups.get(fallback.title) || [fallback];
      const first = rowsForTitle[0];
      const champions = rowsForTitle
        .map((row) => get(row, ["Current Champion(s)", "Current Champion", "Champion", "Champion 1"]))
        .filter((value) => value && normalize(value) !== "vacant tbd" && normalize(value) !== "vacant");
      const faction = rowsForTitle
        .map((row) => get(row, ["Faction / Stable", "Faction", "Team / Stable", "Team", "Current Faction"]))
        .find(Boolean);

      champions.forEach((champion) => state.championNames.add(normalize(champion)));

      return {
        title: fallback.title,
        show: get(first, ["Show", "Home Show"]) || fallback.show,
        champion: champions.join(" & ") || get(first, ["Current Champion(s)", "Current Champion"]) || fallback.champion,
        members: faction && champions.length > 1 ? faction : "",
        defenses: get(first, ["# of Title Defenses", "Title Defenses", "Successful Title Defenses", "Defenses"]) || fallback.defenses
      };
    });
  }

  function renderChampionStrip(championships) {
    const strip = $("#current-champions-strip");
    if (!strip) return;
    strip.replaceChildren();

    championships.forEach((item) => {
      const tile = el("div", `champion-tile ${boardClass(item.show)}`);
      tile.append(el("span", "", item.title.replace(/^Unprovoked\s+/i, "").replace(/\s+Championship$/i, "")));
      tile.append(el("strong", "", item.champion || "Vacant / TBD"));
      strip.append(tile);
    });
  }

  function renderChampionships(rows) {
    const grid = $("#championship-grid");
    if (!grid) return;

    const championships = groupChampions(rows);
    renderChampionStrip(championships);
    grid.replaceChildren();

    championships.forEach((item) => {
      const card = el("article", `title-card ${showClass(item.show)}`);
      const image = el("img");
      image.src = getImageForTitle(item.title);
      image.alt = `${item.champion || "Current Champion"} - ${item.title}`;
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener("error", () => card.classList.add("image-missing"), { once: true });

      card.append(image);
      card.append(el("span", "", item.show));
      card.append(el("strong", "", item.title));
      card.append(el("small", "champion-name", item.champion || "Vacant / TBD"));
      if (item.members) card.append(el("small", "champion-members", item.members));
      card.append(el("small", "title-defenses", `${numberValue(item.defenses)} successful defense${numberValue(item.defenses) === 1 ? "" : "s"}`));
      card.append(el("b", "champion-badge", "Current champion"));
      grid.append(card);
    });
  }

  function renderRoster(selector, rows, labels) {
    const list = `[data-roster-list="${selector}"]`;
    const target = $(list);
    if (!target || !rows.length) return;
    const names = rows
      .map((row) => get(row, labels))
      .filter(Boolean)
      .filter((name) => normalize(name) !== "no formal team")
      .filter((name, index, array) => array.indexOf(name) === index)
      .sort((a, b) => a.localeCompare(b));

    if (!names.length) return;
    target.replaceChildren(...names.map((name) => el("li", "", name)));
  }

  function powerRankRows(rows, showNeedle) {
    return rows
      .map((row) => ({
        rank: get(row, ["Show Rank", "Power Ranking", "Rank", "Power Rank"]),
        wrestler: get(row, ["Wrestler Name", "Wrestler", "Name"]),
        team: get(row, ["Team Name", "Team", "Faction", "Team / Stable"]) || "Free Agent",
        score: get(row, ["Power Score", "Score"]),
        rival: get(row, ["Rival"]),
        show: get(row, ["Home Show", "Show", "Brand"])
      }))
      .filter((row) => row.wrestler && normalize(row.show).includes(showNeedle))
      .sort((a, b) => numberValue(a.rank, 999) - numberValue(b.rank, 999) || numberValue(b.score) - numberValue(a.score))
      .slice(0, 10);
  }

  function showRankRowsFromGrid(rows, startColumn = 0) {
    return rows
      .map((row) => ({
        rank: row[startColumn] || "",
        wrestler: row[startColumn + 1] || "",
        team: row[startColumn + 2] || "Free Agent",
        score: row[startColumn + 3] || "0",
        rival: row[startColumn + 4] || ""
      }))
      .filter((row) => /^\d+$/.test(row.rank) && row.wrestler)
      .slice(0, 10);
  }

  function teamRowsFromGrid(rows, startColumn = 0) {
    return rows
      .map((row) => ({
        rank: row[startColumn] || "",
        team: row[startColumn + 1] || "",
        members: row[startColumn + 2] || "",
        score: row[startColumn + 3] || "0",
        rival: row[startColumn + 4] || ""
      }))
      .filter((row) => /^\d+$/.test(row.rank) && row.team && normalize(row.team) !== "no formal team")
      .slice(0, 10);
  }

  function renderWrestlerBoard(selector, rows) {
    const board = `[data-board="${selector}"]`;
    const target = $(board);
    if (!target || !rows.length) return;

    const header = el("div", "board-table-header rank-board-row");
    ["Show Rank", "Wrestler", "Team", "Score", "Rival"].forEach((label, index) => {
      header.append(el(index === 0 ? "b" : index === 3 ? "em" : index === 4 ? "i" : index === 2 ? "small" : "span", "", label));
    });

    target.replaceChildren(header);
    rows.forEach((row) => {
      const node = el("div", `contender-row rank-board-row${state.championNames.has(normalize(row.wrestler)) ? " champion-row" : ""}`);
      node.append(el("b", "", row.rank || "-"));
      node.append(el("span", "", row.wrestler));
      node.append(el("small", "", row.team));
      node.append(el("em", Number(row.score) < 0 ? "negative-score" : "", row.score || "0"));
      node.append(el("i", "", row.rival || ""));
      target.append(node);
    });
  }

  function renderTeamBoardRows(teams) {
    const board = $('[data-board="fnf-teams"]');
    if (!board || !teams.length) return;

    const header = el("div", "board-table-header team-power-row");
    ["Team Rank", "Team", "Wrestlers In Stable", "Score"].forEach((label, index) => {
      header.append(el(index === 0 ? "b" : index === 2 ? "small" : index === 3 ? "em" : "span", "", label));
    });

    board.replaceChildren(header);
    teams.forEach((row) => {
      const node = el("div", `contender-row team-power-row${state.championNames.has(normalize(row.team)) ? " champion-row" : ""}`);
      node.append(el("b", "", row.rank || "-"));
      node.append(el("span", "", row.team));
      node.append(el("small", "", row.members || ""));
      node.append(el("em", Number(row.score) < 0 ? "negative-score" : "", row.score || "0"));
      board.append(node);
    });
  }

  function renderTeamBoard(rows) {
    const teams = rows
      .map((row) => ({
        rank: get(row, ["Show Team Rank", "Team Rank", "Rank"]),
        team: get(row, ["Team Name", "Team / Stable Name", "Team", "Faction"]),
        members: get(row, ["Wrestlers In Stable", "Members", "Member 1"]),
        score: get(row, ["Combined Team Power Score", "Team Power Score", "Power Score", "Score"])
      }))
      .filter((row) => row.team && normalize(row.team) !== "no formal team")
      .sort((a, b) => numberValue(a.rank, 999) - numberValue(b.rank, 999) || numberValue(b.score) - numberValue(a.score))
      .slice(0, 10);

    renderTeamBoardRows(teams);
  }

  function nonBlank(values) {
    return values.map(clean).filter(Boolean);
  }

  function joinNames(values) {
    const names = nonBlank(values);
    if (!names.length) return "";
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
  }

  function uniqueParts(values) {
    const seen = new Set();
    return nonBlank(values).filter((value) => {
      const key = normalize(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function matchTypeText(match) {
    const type = uniqueParts([match.category, match.type, match.variation]).join(" ");
    return type ? `${type} match` : "match";
  }

  function finishText(value) {
    const finish = clean(value);
    if (!finish) return "the final call";
    if (/^(tko|ko|dq)$/i.test(finish)) return finish.toUpperCase();
    return finish.toLowerCase();
  }

  function losingSide(match) {
    if (match.team && match.teams.length) {
      return match.teams.filter((team) => normalize(team) !== normalize(match.team)).join(" and ");
    }

    if (match.winners.length) {
      return joinNames(match.wrestlers.filter((name) =>
        !match.winners.some((winner) => normalize(winner) === normalize(name))
      ));
    }

    return "";
  }

  function matchupText(match) {
    if (match.teams.length) return match.teams.join(" vs ");
    return joinNames(match.wrestlers);
  }

  function matchHeadline(match) {
    if (match.isDraw) return "No winner recorded";

    const winner = match.team || joinNames(match.winners);
    const loser = losingSide(match);
    if (winner && loser) return `${winner} def. ${loser}`;
    return winner || "Result posted";
  }

  function resultRecap(match) {
    const show = match.show || "UJWF";
    const type = matchTypeText(match);
    const finish = finishText(match.victory);
    const fall = match.fall ? `, with ${match.fall} taking the fall` : "";
    const winners = match.team || joinNames(match.winners);
    const winnerDetail = match.team && match.winners.length ? ` (${joinNames(match.winners)})` : "";
    const losers = losingSide(match);
    const matchup = matchupText(match);

    if (match.isDraw) {
      return `${matchup || "The match"} battled on ${show} in a ${type}. The bout ended by ${finish}, so no winner was recorded.`;
    }

    if (winners && losers) {
      return `${winners}${winnerDetail} picked up the win over ${losers} on ${show} in a ${type}. The finish came by ${finish}${fall}.`;
    }

    if (winners) {
      return `${winners}${winnerDetail} picked up the win on ${show} in a ${type}. The finish came by ${finish}${fall}.`;
    }

    return `${matchup || "The match"} hit the card on ${show} in a ${type}. The final call was ${finish}${fall}.`;
  }

  function renderRecentResults(rows) {
    const target = $("#live-recent-results");
    if (!target || !rows.length) return;

    const matches = rows
      .map((row) => ({
        id: get(row, ["Match ID"]),
        week: get(row, ["Match Week", "Date", "Week"]),
        show: get(row, ["Show"]),
        category: get(row, ["Match Category"]),
        type: get(row, ["Match Type"]),
        variation: get(row, ["Match Variation"]),
        count: get(row, ["Participant Count"]),
        wrestlers: [
          get(row, ["Wrestler 1"]),
          get(row, ["Wrestler 2"]),
          get(row, ["Wrestler 3"]),
          get(row, ["Wrestler 4"]),
          get(row, ["Wrestler 5"]),
          get(row, ["Wrestler 6"]),
          get(row, ["Wrestler 7"]),
          get(row, ["Wrestler 8"])
        ].filter(Boolean),
        teams: [
          get(row, ["Team 1"]),
          get(row, ["Team 2"]),
          get(row, ["Team 3"]),
          get(row, ["Team 4"])
        ].filter(Boolean),
        winners: [
          get(row, ["Primary Winner / Match Ended By", "Winner", "Winner 1"]),
          get(row, ["Winner 2"]),
          get(row, ["Winner 3"]),
          get(row, ["Winner 4"])
        ].filter(Boolean),
        victory: get(row, ["Victory Condition"]),
        fall: get(row, ["Fall Taken By"]),
        team: get(row, ["Winning Team"]),
        championship: get(row, ["Championship Match"]),
        title: get(row, ["Title Defended"]),
        titleDefense: get(row, ["Title Defense?"]),
        tournament: get(row, ["Tournament Match"]),
        tournamentName: get(row, ["Tournament Name"]),
        tournamentWinner: get(row, ["Tournament Winner?"]),
        notes: get(row, ["Notes"])
      }))
      .filter((row) => row.id || row.winners.length || row.team || row.show)
      .map((match) => ({
        ...match,
        isDraw: /draw|count out|no contest/i.test(match.victory || "") && !match.winners.length && !match.team
      }))
      .sort((a, b) => matchIdNumber(b.id) - matchIdNumber(a.id))
      .slice(0, 6);

    if (!matches.length) return;
    target.replaceChildren();
    target.append(el("h3", "", "Latest results from live events"));
    const list = el("div", "recent-result-list");
    matches.forEach((match) => {
      const card = el("article", "recent-result-card");
      card.append(el("span", "", `${match.id || "Match"}${match.week ? ` / Week ${match.week}` : ""}`));
      card.append(el("strong", "", matchHeadline(match)));
      card.append(el("p", "result-summary", resultRecap(match)));
      list.append(card);
    });
    target.append(list);
  }

  function setStatus(message, isError = false) {
    const status = $("#site-updated");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  function setupLatestVideo() {
    const playlistUrl = `https://www.youtube.com/playlist?list=${CONFIG.youtubePlaylistId}`;
    const embedBase = `https://www.youtube.com/embed/videoseries?list=${CONFIG.youtubePlaylistId}&autoplay=1&mute=1&playsinline=1&rel=0`;
    const frame = $(".video-frame iframe");
    const thumbnail = $(".video-thumb");
    const subline = $(".video-subline");
    const copyTitle = $(".video-copy strong");
    const copyNote = $(".video-copy small");
    const openVideo = $(".youtube-action");
    const playlistLink = $(".playlist-action");

    const refreshEmbed = () => {
      if (!frame) return;
      const refreshKey = Math.floor(Date.now() / CONFIG.videoRefreshMs);
      frame.src = `${embedBase}&refresh=${refreshKey}`;
      frame.title = "Latest videos from the UJWF TV playlist";
    };

    refreshEmbed();
    window.setInterval(refreshEmbed, CONFIG.videoRefreshMs);

    if (thumbnail) {
      thumbnail.src = "assets/logos/ujwf-federation.webp";
      thumbnail.alt = "UJWF TV";
    }
    if (subline) subline.textContent = "The newest fight night from UJWF TV, pulled straight from the playlist.";
    if (copyTitle) copyTitle.textContent = "Fresh from UJWF TV";
    if (copyNote) copyNote.textContent = "When the playlist gets a new top video, this spot rolls forward with it.";
    if (openVideo) {
      openVideo.href = playlistUrl;
      openVideo.textContent = "Play Latest";
    }
    if (playlistLink) playlistLink.href = playlistUrl;
  }

  function setupMenu() {
    const button = $(".menu-toggle");
    const nav = $("#primary-nav");
    if (!button || !nav) return;

    const closeMenu = () => {
      button.setAttribute("aria-expanded", "false");
      document.body.classList.remove("menu-open");
    };

    const openMenu = () => {
      button.setAttribute("aria-expanded", "true");
      document.body.classList.add("menu-open");
    };

    button.addEventListener("click", () => {
      const isOpen = button.getAttribute("aria-expanded") === "true";
      isOpen ? closeMenu() : openMenu();
    });

    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });

    document.addEventListener("click", (event) => {
      if (!document.body.classList.contains("menu-open")) return;
      if (event.target.closest(".site-header")) return;
      closeMenu();
    });
  }

  async function loadLiveData() {
    setStatus("Checking the live UJWF record book...");
    const requests = await Promise.allSettled([
      fetchSheet(CONFIG.sheets.champions),
      fetchSheet(CONFIG.sheets.rankings),
      fetchSheet(CONFIG.sheets.matchDatabase),
      fetchSheet(CONFIG.sheets.mnjRoster),
      fetchSheet(CONFIG.sheets.wedRoster),
      fetchSheet(CONFIG.sheets.teams),
      fetchSheetGrid(CONFIG.sheets.mnjRoster, "K1:O12"),
      fetchSheetGrid(CONFIG.sheets.wedRoster, "K1:O12"),
      fetchSheetGrid(CONFIG.sheets.fnfRoster, "T1:X12")
    ]);

    const [champions, rankings, matches, mnjRoster, wedRoster, teams, mnjShowRanks, wedShowRanks, fnfBoardGrid] = requests.map((result) =>
      result.status === "fulfilled" ? result.value : []
    );

    try {
      if (champions.length) renderChampionships(champions);
      if (mnjRoster.length) renderRoster("mnj", mnjRoster, ["Wrestler", "Name"]);
      if (wedRoster.length) renderRoster("wed", wedRoster, ["Wrestler", "Name"]);
      if (teams.length) renderRoster("fnf", teams, ["Team / Stable Name", "Team Name", "Faction"]);
      const mnjBoardRows = showRankRowsFromGrid(mnjShowRanks);
      const wedBoardRows = showRankRowsFromGrid(wedShowRanks);
      const teamRows = teamRowsFromGrid(fnfBoardGrid);
      if (mnjBoardRows.length) renderWrestlerBoard("mnj-wrestlers", mnjBoardRows);
      if (wedBoardRows.length) renderWrestlerBoard("wed-wrestlers", wedBoardRows);
      if (teamRows.length) renderTeamBoardRows(teamRows);
      if (rankings.length) {
        if (!mnjBoardRows.length) renderWrestlerBoard("mnj-wrestlers", powerRankRows(rankings, "monday"));
        if (!wedBoardRows.length) renderWrestlerBoard("wed-wrestlers", powerRankRows(rankings, "walk"));
        if (!teamRows.length) renderTeamBoard(rankings);
      }
      if (matches.length) renderRecentResults(matches);

      const successful = requests.filter((result) => result.status === "fulfilled").length;
      if (successful) {
        setStatus(`Live sheet data refreshed ${new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`);
      } else {
        setStatus("Showing saved site data for now. The live sheet needs public access to refresh here.", true);
      }
    } catch (error) {
      console.error("UJWF render error", error);
      setStatus("Showing saved site data for now. The live sheet did not answer in time.", true);
    }

    requests
      .filter((result) => result.status === "rejected")
      .forEach((result) => console.warn("UJWF sheet load warning", result.reason));
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupMenu();
    setupLatestVideo();
    loadLiveData();
  });
})();
