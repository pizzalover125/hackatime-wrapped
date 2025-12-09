const API_BASE = "https://hackatime.hackclub.com/api/v1/users";

const app = {
  userId: null,
  data: {
    daily: [],
    totalSeconds: 0,
    languages: {},
    editors: {},
    operatingSystems: {},
  },
  slides: [],
  currentSlide: 0,
  touchStartX: 0,
  touchEndX: 0,

  init: () => {
    // start button
    document.getElementById("start-btn").addEventListener("click", app.start);

    // physical buttons
    document
      .getElementById("prev-btn")
      .addEventListener("click", app.prevSlide);
    document
      .getElementById("next-btn")
      .addEventListener("click", app.nextSlide);

    // arrow keys
    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") app.nextSlide();
      if (e.key === "ArrowLeft") app.prevSlide();
    });

    // swipe controls
    document.addEventListener("touchstart", (e) => {
      app.touchStartX = e.changedTouches[0].screenX;
    });

    document.addEventListener("touchend", (e) => {
      app.touchEndX = e.changedTouches[0].screenX;
      app.handleSwipe();
    });
  },

  handleSwipe: () => {
    if (app.touchEndX < app.touchStartX - 50) app.nextSlide();
    if (app.touchEndX > app.touchStartX + 50) app.prevSlide();
  },

  start: async () => {
    // get slack ID from input... was thinking of doing Hack Club Auth, but it seems too complex for thi
    const input = document.getElementById("user-id");
    const id = input.value.trim();
    if (!id) {
      alert("Please enter a User ID");
      return;
    }
    app.userId = id;

    // hide login screen, show loading
    document.getElementById("login-screen").classList.remove("active");
    document.getElementById("loading-screen").classList.add("active");

    // fetch stuff
    await app.fetchData();
    app.processData();
    app.generateSlides();

    // hide loading screen, show wrapped screen
    document.getElementById("loading-screen").classList.remove("active");
    document.getElementById("wrapped-screen").classList.add("active");
    app.showSlide(0);
  },

  // fetch all data for the year
  fetchData: async () => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const startDate = new Date(`${currentYear}-01-01`);
    const daysToFetch = [];

    // get days of year
    let d = new Date(startDate);
    while (d <= today) {
      daysToFetch.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }

    // progress bar
    const totalDays = daysToFetch.length;
    let completed = 0;
    const updateProgress = () => {
      completed++;
      const pct = (completed / totalDays) * 100;
      document.getElementById("progress-fill").style.width = `${pct}%`;
    };

    // get data in batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < daysToFetch.length; i += BATCH_SIZE) {
      const batch = daysToFetch.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (date) => {
          try {
            const stats = await app.fetchDayStats(date);
            app.data.daily.push({
              date: date,
              stats: stats || {
                total_seconds: 0,
                languages: [],
                operating_systems: [],
                editors: [],
              },
            });
          } catch (e) {
            console.error(`Failed to fetch ${date}`, e);
            app.data.daily.push({
              date: date,
              stats: {
                total_seconds: 0,
                languages: [],
                operating_systems: [],
                editors: [],
              },
            });
          } finally {
            updateProgress();
          }
        })
      );
    }
  },

  // fetch stats for a specific day
  fetchDayStats: async (date) => {
    // Convert to UTC ISO Midnight

    const toUtcIsoMidnight = (date) =>
      new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        0,
        0,
        0,
        0
      ).toISOString();

    const start = toUtcIsoMidnight(date);
    const nextDay = new Date(date);
    nextDay.setDate(date.getDate() + 1);
    const end = toUtcIsoMidnight(nextDay);

    const url = `${API_BASE}/${app.userId}/stats?start_date=${start}&end_date=${end}`;

    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data;
    } catch (e) {
      return null;
    }
  },

  processData: () => {
    // sort daily data by date
    app.data.daily.sort((a, b) => a.date - b.date);

    app.data.daily.forEach((day) => {
      const seconds = day.stats.total_seconds;
      app.data.totalSeconds += seconds;

      // add up languages
      if (day.stats.languages) {
        day.stats.languages.forEach((lang) => {
          if (!app.data.languages[lang.name]) app.data.languages[lang.name] = 0;
          app.data.languages[lang.name] += lang.total_seconds;
        });
      }

      // add up editors
      if (day.stats.editors) {
        day.stats.editors.forEach((ed) => {
          if (!app.data.editors[ed.name]) app.data.editors[ed.name] = 0;
          app.data.editors[ed.name] += ed.total_seconds;
        });
      }
    });

    // calculate favorite day
    const dayTotals = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const dayCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    app.data.daily.forEach((d) => {
      const day = d.date.getDay();
      dayTotals[day] += d.stats.total_seconds;
      dayCounts[day]++;
    });

    let bestDayIndex = 0;
    let maxAvg = 0;
    for (let i = 0; i < 7; i++) {
      const avg = dayCounts[i] ? dayTotals[i] / dayCounts[i] : 0;
      if (avg > maxAvg) {
        maxAvg = avg;
        bestDayIndex = i;
      }
    }
    app.data.favoriteDay = dayNames[bestDayIndex];
    app.data.favoriteDayAvg = maxAvg;

    // calculate longest streak
    let maxStreak = 0;
    let currentStreak = 0;
    app.data.daily.forEach((d) => {
      if (d.stats.total_seconds > 0) {
        currentStreak++;
      } else {
        if (currentStreak > maxStreak) maxStreak = currentStreak;
        currentStreak = 0;
      }
    });
    if (currentStreak > maxStreak) maxStreak = currentStreak;
    app.data.longestStreak = maxStreak;

    // calculate longest unproductive streak
    let maxUnproductiveStreak = 0;
    let currentUnproductiveStreak = 0;
    app.data.daily.forEach((d) => {
      if (d.stats.total_seconds === 0) {
        currentUnproductiveStreak++;
      } else {
        if (currentUnproductiveStreak > maxUnproductiveStreak)
          maxUnproductiveStreak = currentUnproductiveStreak;
        currentUnproductiveStreak = 0;
      }
    });
    if (currentUnproductiveStreak > maxUnproductiveStreak)
      maxUnproductiveStreak = currentUnproductiveStreak;
    app.data.longestUnproductiveStreak = maxUnproductiveStreak;
  },

  generateSlides: () => {
    const slides = [];

    // intro
    slides.push(`
            <div class="slide">
                <h2>Your 2025</h2>
                <div class="stat-big">Hackatime WRAPPED</div>
                <p>Let's see what you've been up to.</p>
            </div>
        `);

    // contribution graph
    const getColor = (seconds) => {
      if (seconds === 0) return "#252525";
      if (seconds < 3600) return "#5c1520";
      if (seconds < 3600 * 3) return "#8a1c2e";
      if (seconds < 3600 * 6) return "#b8233c";
      return "#ec3750";
    };

    const firstDay =
      app.data.daily.length > 0 ? app.data.daily[0].date.getDay() : 0;
    const emptyDays = Array(firstDay)
      .fill('<div class="day empty"></div>')
      .join("");

    const totalDays = 365;

    const allDays = Array.from({ length: totalDays }, (_, i) => {
      if (i < app.data.daily.length) {
        return app.data.daily[i].stats.total_seconds;
      }
      return 0;
    });

    const graphHtml = `
      <div class="contribution-graph-container">
        <div class="contribution-graph">
          ${emptyDays}
          ${allDays
            .map(
              (seconds) =>
                `<div class="day" style="background: ${getColor(
                  seconds
                )};"></div>`
            )
            .join("")}
        </div>
      </div>
    `;

    slides.push(`
        <div class="slide">
            <h2>Your Year in Code</h2>
            ${graphHtml}
        </div>
    `);

    // total hours
    const totalHours = Math.round(app.data.totalSeconds / 3600);
    slides.push(`
            <div class="slide slide-total-hours">
                <div class="stat-label">Total Time Coding</div>
                <div class="stat-big">${totalHours}</div>
                <div class="stat-label">HOURS</div>
            </div>
        `);

    // top 3 days
    const sortedDays = [...app.data.daily]
      .sort((a, b) => b.stats.total_seconds - a.stats.total_seconds)
      .slice(0, 3);
    let daysHtml = sortedDays
      .map(
        (d, i) => `
            <div class="list-item">
                <span class="list-rank">#${i + 1}</span>
                <span>${d.date.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}</span>
                <span class="list-val">${(d.stats.total_seconds / 3600).toFixed(
                  1
                )}h</span>
            </div>
        `
      )
      .join("");
    slides.push(`
            <div class="slide">
                <h2>Most Productive Days</h2>
                ${daysHtml}
            </div>
        `);

    // top 3 weeks
    const weeks = {};
    app.data.daily.forEach((d) => {
      const date = new Date(d.date);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date);
      monday.setDate(diff);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const key = `${monday.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })} - ${sunday.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })}`;
      if (!weeks[key]) weeks[key] = 0;
      weeks[key] += d.stats.total_seconds;
    });
    const sortedWeeks = Object.entries(weeks).sort((a, b) => b[1] - a[1]);
    const topWeeks = sortedWeeks.slice(0, 3);
    const worstWeek = sortedWeeks[sortedWeeks.length - 1];

    let weeksHtml = topWeeks
      .map(
        (w, i) => `
            <div class="list-item">
                <span class="list-rank">#${i + 1}</span>
                <span>${w[0]}</span>
                <span class="list-val">${(w[1] / 3600).toFixed(1)}h</span>
            </div>
        `
      )
      .join("");
    slides.push(`
            <div class="slide">
                <h2>Most Productive Weeks</h2>
                ${weeksHtml}
            </div>
        `);

    // top 3 months
    const months = {};
    app.data.daily.forEach((d) => {
      const key = d.date.toLocaleDateString(undefined, { month: "long" });
      if (!months[key]) months[key] = 0;
      months[key] += d.stats.total_seconds;
    });
    const sortedMonths = Object.entries(months)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    let monthsHtml = sortedMonths
      .map(
        (m, i) => `
            <div class="list-item">
                <span class="list-rank">#${i + 1}</span>
                <span>${m[0]}</span>
                <span class="list-val">${(m[1] / 3600).toFixed(1)}h</span>
            </div>
        `
      )
      .join("");
    slides.push(`
            <div class="slide">
                <h2>Most Productive Months</h2>
                ${monthsHtml}
            </div>
        `);

    // favorite language
    const sortedLangs = Object.entries(app.data.languages).sort(
      (a, b) => b[1] - a[1]
    );
    const topLang = sortedLangs[0] || ["None", 0];
    slides.push(`
            <div class="slide slide-lang">
                <div class="stat-label">Favorite Language</div>
                <div class="stat-big">${topLang[0]}</div>
                <p>${(topLang[1] / 3600).toFixed(1)} hours</p>
            </div>
        `);

    // favorite day
    slides.push(`
        <div class="slide">
            <div class="stat-label">Favorite Day</div>
            <div class="stat-big">${app.data.favoriteDay}</div>
            <p>Average: ${(app.data.favoriteDayAvg / 3600).toFixed(1)} hours</p>
        </div>
    `);

    // worst week
    if (worstWeek) {
      slides.push(`
                <div class="slide">
                    <h2>Most Unproductive Week</h2>
                    <div class="stat-big" style="font-size: 3rem;">${
                      worstWeek[0]
                    }</div>
                    <p>Only ${(worstWeek[1] / 3600).toFixed(1)} hours</p>
                    <p>We all need a break!</p>
                </div>
            `);
    }

    // longest streak
    slides.push(`
            <div class="slide">
                <div class="stat-label">Longest Streak</div>
                <div class="stat-big">${app.data.longestStreak}</div>
                <div class="stat-label">DAYS</div>
            </div>
        `);

    // longest unproductive streak
    slides.push(`
            <div class="slide">
                <div class="stat-label">Longest Inactive Streak</div>
                <div class="stat-big">${app.data.longestUnproductiveStreak}</div>
                <div class="stat-label">DAYS</div>
            </div>
        `);

    // outro
    slides.push(`
            <div class="slide">
                <h2>That's a wrap!</h2>
                <p>See you next year.</p>
                <button onclick="app.downloadSummaryImage()" style="margin-bottom: 1rem;">Download Summary</button>
                <button onclick="location.reload()">Start Over</button>
            </div>
        `);

    app.slides = slides;
    document.getElementById("slide-container").innerHTML = slides.join("");

    // hide all slides initially
    const slideEls = document.querySelectorAll(".slide");
    slideEls.forEach((el) => (el.style.display = "none"));
  },

  downloadSummaryImage: () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // dimensions
    const width = 1000;
    const height = 1000;
    canvas.width = width;
    canvas.height = height;

    const colors = [
      "#ec3750",
      "#ff8c37",
      "#f1c40f",
      "#33d6a6",
      "#5bc0de",
      "#338eda",
      "#a633d6",
      "#8492a6",
    ];

    // background
    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, width, height);

    // header

    // 2025
    ctx.save();
    ctx.translate(75, 200);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = colors[6];
    ctx.font = "bold 150px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("2025", 0, 0);
    ctx.restore();

    // cover art
    const coverSize = 275;
    const coverX = (width - coverSize) / 2;
    const coverY = 50;

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(coverX, coverY, coverSize, coverSize);

    // abstract pattern
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = colors[i % colors.length];
      const w = Math.random() * 150 + 25;
      const h = 12;
      const x = coverX + Math.random() * (coverSize - w);
      const y = coverY + Math.random() * (coverSize - h);
      ctx.globalAlpha = 0.8;
      ctx.fillRect(x, y, w, h);
    }
    ctx.globalAlpha = 1.0;

    // overlay text
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 30px sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 5;
    ctx.fillText(
      "HACKATIME",
      coverX + coverSize / 2,
      coverY + coverSize / 2 - 30
    );
    ctx.fillText(
      "WRAPPED",
      coverX + coverSize / 2,
      coverY + coverSize / 2 + 10
    );

    ctx.shadowBlur = 0;

    // data calculation
    // top languages
    const sortedLangs = Object.entries(app.data.languages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // top days
    const sortedDays = [...app.data.daily]
      .sort((a, b) => b.stats.total_seconds - a.stats.total_seconds)
      .slice(0, 3)
      .map((d) => [
        d.date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        d.stats.total_seconds,
      ]);

    // total hours
    const totalHours = Math.round(app.data.totalSeconds / 3600);

    // longest streak
    const longestStreak = app.data.longestStreak;
    const longestUnproductiveStreak = app.data.longestUnproductiveStreak;

    // most productive month
    const months = {};
    app.data.daily.forEach((d) => {
      const key = d.date.toLocaleDateString(undefined, { month: "long" });
      if (!months[key]) months[key] = 0;
      months[key] += d.stats.total_seconds;
    });
    const sortedMonths = Object.entries(months).sort((a, b) => b[1] - a[1]);
    const topMonth = sortedMonths[0] || ["None", 0];

    // least productive week
    const weeks = {};
    app.data.daily.forEach((d) => {
      const date = new Date(d.date);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date);
      monday.setDate(diff);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const key = `${monday.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })} - ${sunday.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })}`;
      if (!weeks[key]) weeks[key] = 0;
      weeks[key] += d.stats.total_seconds;
    });
    const sortedWeeks = Object.entries(weeks).sort((a, b) => b[1] - a[1]);
    const worstWeek = sortedWeeks[sortedWeeks.length - 1] || ["None", 0];

    const startY = 375;
    const gap = 20;
    const margin = 25;
    const boxWidth = (width - margin * 2 - gap * 2) / 3;
    const boxHeight = 160;

    const graphWidth = boxWidth * 2 + gap;
    const graphHeight = boxHeight;
    const graphX = margin + boxWidth + gap;
    const graphY = startY;

    const gridStartY = startY;

    const drawBox = (col, row, color, title, renderContent) => {
      const x = margin + col * (boxWidth + gap);
      const y = gridStartY + row * (boxHeight + gap);

      ctx.fillStyle = color;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, boxWidth, boxHeight, 10);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, boxWidth, boxHeight);
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(title.toUpperCase(), x + 12, y + 25);

      renderContent(x, y, boxWidth, boxHeight, "#ffffff");
    };

    ctx.fillStyle = "#1a1a1a";
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(graphX, graphY, graphWidth, graphHeight, 10);
      ctx.fill();
    } else {
      ctx.fillRect(graphX, graphY, graphWidth, graphHeight);
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("YEAR IN CODE", graphX + 12, graphY + 25);

    const days = app.data.daily;

    const cols = 53;
    const rows = 7;
    const cellGap = 2;

    const availableWidth = graphWidth - 20;
    const availableHeight = graphHeight - 50;
    const cellSize = Math.min(
      (availableWidth - (cols - 1) * cellGap) / cols,
      (availableHeight - (rows - 1) * cellGap) / rows
    );

    // center vertically
    const totalGraphHeight = rows * cellSize + (rows - 1) * cellGap;
    const remainingHeight = graphHeight - 40;
    const offsetY = (remainingHeight - totalGraphHeight) / 2;

    const startGraphX = graphX + 10;
    const startGraphY = graphY + 40 + offsetY;

    const getColor = (seconds) => {
      if (seconds === 0) return "#252525";
      if (seconds < 3600) return "#5c1520";
      if (seconds < 3600 * 3) return "#8a1c2e";
      if (seconds < 3600 * 6) return "#b8233c";
      return "#ec3750";
    };

    if (days.length > 0) {
      const firstDate = new Date(days[0].date);
      const startDay = firstDate.getDay();

      const totalDays = 365;

      for (let i = 0; i < totalDays; i++) {
        const adjustedIndex = i + startDay;
        const col = Math.floor(adjustedIndex / 7);
        const row = adjustedIndex % 7;

        if (col < cols) {
          let seconds = 0;
          if (i < days.length) {
            seconds = days[i].stats.total_seconds;
          }

          ctx.fillStyle = getColor(seconds);
          const cx = startGraphX + col * (cellSize + cellGap);
          const cy = startGraphY + row * (cellSize + cellGap);

          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(cx, cy, cellSize, cellSize, 1);
            ctx.fill();
          } else {
            ctx.fillRect(cx, cy, cellSize, cellSize);
          }
        }
      }
    }

    // row 0
    // box 1
    drawBox(0, 0, colors[0], "Top Languages", (x, y, w, h, textColor) => {
      sortedLangs.forEach((item, i) => {
        const yPos = y + 60 + i * 40;
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "bold 25px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`#${i + 1}`, x + 12, yPos);

        ctx.fillStyle = textColor;
        ctx.fillText(item[0], x + 55, yPos);
      });
    });

    // row 1
    // box 2
    drawBox(0, 1, colors[5], "Least Productive", (x, y, w, h, textColor) => {
      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.font = "bold 50px sans-serif";
      ctx.fillText((worstWeek[1] / 3600).toFixed(1), x + w / 2, y + h / 2);
      ctx.font = "bold 18px sans-serif";
      ctx.fillText("HOURS", x + w / 2, y + h / 2 + 25);
      ctx.font = "bold 14px sans-serif";
      ctx.fillText(worstWeek[0], x + w / 2, y + h / 2 + 50);
    });

    // box 3
    drawBox(1, 1, colors[2], "Total Hours", (x, y, w, h, textColor) => {
      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.font = "bold 70px sans-serif";
      ctx.fillText(totalHours, x + w / 2, y + h / 2 + 10);
      ctx.font = "bold 20px sans-serif";
      ctx.fillText("HOURS", x + w / 2, y + h / 2 + 45);
    });

    // box 4
    drawBox(2, 1, colors[3], "Top Days", (x, y, w, h, textColor) => {
      sortedDays.forEach((item, i) => {
        const yPos = y + 60 + i * 40;
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "bold 25px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`#${i + 1}`, x + 12, yPos);

        ctx.fillStyle = textColor;
        ctx.fillText(item[0], x + 55, yPos);
      });
    });

    // row 2
    // box 5
    drawBox(0, 2, colors[4], "Longest Streak", (x, y, w, h, textColor) => {
      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.font = "bold 70px sans-serif";
      ctx.fillText(longestStreak, x + w / 2, y + h / 2 + 10);
      ctx.font = "bold 20px sans-serif";
      ctx.fillText("DAYS", x + w / 2, y + h / 2 + 45);
    });

    // box 6
    drawBox(1, 2, colors[6], "Best Month", (x, y, w, h, textColor) => {
      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.font = "bold 40px sans-serif";
      ctx.fillText(topMonth[0], x + w / 2, y + h / 2 + 5);
      ctx.font = "bold 20px sans-serif";
      ctx.fillText(
        `${(topMonth[1] / 3600).toFixed(0)} HOURS`,
        x + w / 2,
        y + h / 2 + 40
      );
    });

    // box 7
    drawBox(
      2,
      2,
      colors[7],
      "Longest Inactive Streak",
      (x, y, w, h, textColor) => {
        ctx.fillStyle = textColor;
        ctx.textAlign = "center";
        ctx.font = "bold 70px sans-serif";
        ctx.fillText(longestUnproductiveStreak, x + w / 2, y + h / 2 + 10);
        ctx.font = "bold 20px sans-serif";
        ctx.fillText("DAYS", x + w / 2, y + h / 2 + 45);
      }
    );

    // --- Footer ---
    const footerY = height - 25;
    ctx.textAlign = "center";
    ctx.font = "15px sans-serif";

    const text1 = "Get yours at ";
    const text2 = "hackatime-wrapped.netlify.app";

    const text1Width = ctx.measureText(text1).width;
    const text2Width = ctx.measureText(text2).width;
    const totalWidth = text1Width + text2Width + 20;

    const startX = (width - totalWidth) / 2;

    const clockX = startX;
    const clockY = footerY - 5;
    ctx.beginPath();
    ctx.arc(clockX + 7.5, clockY, 7.5, 0, 2 * Math.PI);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(clockX + 7.5, clockY - 4);
    ctx.lineTo(clockX + 7.5, clockY);
    ctx.lineTo(clockX + 11, clockY + 2.5);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText(text1, startX + 20, footerY);

    ctx.fillStyle = colors[4];
    ctx.fillText(text2, startX + 20 + text1Width, footerY);

    const link = document.createElement("a");
    link.download = "hackatime-wrapped-2025.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  },
  showSlide: (index) => {
    const slideEls = document.querySelectorAll(".slide");
    if (index >= 0 && index < slideEls.length) {
      slideEls.forEach((el) => (el.style.display = "none"));
      slideEls[index].style.display = "flex";
      app.currentSlide = index;
    }
  },

  nextSlide: () => {
    app.showSlide(app.currentSlide + 1);
  },

  prevSlide: () => {
    app.showSlide(app.currentSlide - 1);
  },
};

app.init();
