import Head from "next/head";
import Navbar from "@/components/Navbar";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/lib/api";
import Stack from "@mui/material/Stack";
import { LineChart } from "@mui/x-charts/LineChart";
import IconButton from "@mui/material/IconButton";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useRouter } from "next/router";
import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";

type StockQuote = {
  id: string;
  symbol: string;
  price_current: number;
  change_price: number;
  change_percent: number;
  ema_20: number;
  ema_100: number;
  tanh_ema: number;
  change_ema_20: number;
  change_tanh_ema: number;
  ema_trend: number;
  created_at: string;
};

type StockQuoteResponse = {
  status?: {
    code?: string;
    message?: string;
  };
  data?: StockQuote[];
};

type StockDaily = {
  id: string;
  symbol: string;
  price_high: number;
  price_low: number;
  price_open: number;
  price_prev_close: number;
  created_at: string;
};

type StockDailyResponse = {
  status?: {
    code?: string;
    message?: string;
  };
  data?: StockDaily[];
};

type StockQuoteStreamPayload = {
  data?: StockQuote | null;
  quote?: StockQuote | null;
};

const scoreEmaColor = (score?: number | null) => {
  if (score == null) return "text.primary";
  if (score >= 3) return "success.dark";
  if (score >= 1) return "success.light";
  if (score <= -3) return "error.dark";
  if (score <= -1) return "error.light";
  return "text.primary";
}; 

const parseDateTime = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(" ", "T");
  return new Date(normalized);
};

const wsApiBaseUrl = process.env.NEXT_PUBLIC_WS_API_BASE
const fallbackPollIntervalMs = 5 * 60 * 1000;

const isStockQuote = (value: unknown): value is StockQuote => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const quote = value as Partial<StockQuote>;
  return Boolean(
    quote.symbol &&
      quote.created_at &&
      typeof quote.price_current === "number" &&
      typeof quote.ema_20 === "number" &&
      typeof quote.ema_100 === "number"
  );
};

const parseQuoteStreamPayload = (raw: unknown) => {
  if (isStockQuote(raw)) {
    return raw;
  }
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const payload = raw as StockQuoteStreamPayload;
  if (isStockQuote(payload.data)) {
    return payload.data;
  }
  if (isStockQuote(payload.quote)) {
    return payload.quote;
  }
  return null;
};

type AlertPayload = {
  message?: string;
  event?: {
    id?: string;
    symbol?: string;
    trend_ema_20?: number;
    trend_tanh_ema?: number;
    score_ema?: number;
    score_p_cross_ema?: number;
    created_at?: string;
  };
  [key: string]: unknown;
};

const isAlertForSymbol = (alert: AlertPayload, targetSymbol?: string) => {
  const alertSymbol = alert.event?.symbol;
  if (!targetSymbol || !alertSymbol) {
    return false;
  }
  return alertSymbol.toUpperCase() === targetSymbol.toUpperCase();
};

export default function StockDetailDailyPage() {
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const symbol = Array.isArray(router.query.symbol)
    ? router.query.symbol[0]
    : router.query.symbol;
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [stockDaily, setStockDaily] = useState<StockDaily | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertPayload[]>([]);
  const chartScrollRef = useRef<HTMLDivElement | null>(null);
  const hasInitialScroll = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isActive = true;
    let attempts = 0;

    const connect = () => {
      if (!isActive) return;

      ws = new WebSocket(`${wsApiBaseUrl}/alerts/ws`);

      ws.onopen = () => {
        attempts = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as AlertPayload | string;
          if (typeof data !== "string") {
            if (isAlertForSymbol(data, symbol)) {
              setAlerts((prev) => [data, ...prev].slice(0, 5));
            }
          }
        } catch {
          return;
        }
      };

      ws.onclose = () => {
        if (!isActive) return;
        const delay = Math.min(30000, 1000 * 2 ** attempts);
        attempts += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      isActive = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      ws?.close();
    };
  }, [symbol]);

  const latestAlertForSymbol = useMemo(() => {
    return alerts.find((alert) => isAlertForSymbol(alert, symbol));
  }, [alerts, symbol]);

  useEffect(() => {
    if (!symbol) return;

    let isMounted = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackPollTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const loadQuotes = async (isFallback = false) => {
      if (!isFallback) {
        setIsLoading(true);
        setError(null);
      }
      try {
        const query = new URLSearchParams({ symbol }).toString();
        const data = await fetchJson<StockQuoteResponse>(
          `/v1/stock-quotes?${query}`,
          {
            method: "GET",
          }
        );
        if (isMounted) {
          setQuotes(data.data ?? []);
        }
      } catch (err) {
        if (isMounted && !isFallback) {
          const message = err instanceof Error ? err.message : "Load failed";
          setError(message);
        }
      } finally {
        if (isMounted && !isFallback) {
          setIsLoading(false);
        }
      }
    };

    const loadStockDaily = async () => {
      try {
        const query = new URLSearchParams({ symbol }).toString();
        const data = await fetchJson<StockDailyResponse>(
          `/v1/stock-daily?${query}`,
          {
            method: "GET",
          }
        );
        if (isMounted) {
          setStockDaily(data.data?.[0] ?? null);
        }
      } catch {
        if (isMounted) {
          setStockDaily(null);
        }
      }
    };

    const stopFallbackPolling = () => {
      if (fallbackPollTimer) {
        clearTimeout(fallbackPollTimer);
        fallbackPollTimer = null;
      }
    };

    const startFallbackPolling = () => {
      if (!isMounted || fallbackPollTimer) {
        return;
      }

      const poll = async () => {
        if (!isMounted) {
          return;
        }
        await loadQuotes(true);
        if (!isMounted || ws?.readyState === WebSocket.OPEN) {
          fallbackPollTimer = null;
          return;
        }
        fallbackPollTimer = setTimeout(poll, fallbackPollIntervalMs);
      };

      fallbackPollTimer = setTimeout(poll, fallbackPollIntervalMs);
    };

    const connectQuoteStream = () => {
      if (!isMounted) return;

      ws = new WebSocket(`${wsApiBaseUrl}/stock-quotes/ws`);

      ws.onopen = () => {
        attempts = 0;
        stopFallbackPolling();
      };

      ws.onmessage = (event) => {
          console.log("quote ws raw:", event.data);
        try {
          const parsed = JSON.parse(event.data) as unknown;
          const nextQuote = parseQuoteStreamPayload(parsed);
          if (!nextQuote || nextQuote.symbol !== symbol) {
            return;
          }

          setQuotes((prev) => {
            const existingIndex = prev.findIndex(
              (item) =>
                item.id === nextQuote.id || item.created_at === nextQuote.created_at
            );
            if (existingIndex >= 0) {
              const next = [...prev];
              next[existingIndex] = nextQuote;
              return next;
            }
            return [...prev, nextQuote].slice(-1000);
          });
        } catch {
          return;
        }
      };

      ws.onclose = () => {
        if (!isMounted) {
          return;
        }
        startFallbackPolling();
        const delay = Math.min(30000, 1000 * 2 ** attempts);
        attempts += 1;
        reconnectTimer = setTimeout(connectQuoteStream, delay);
      };
    };

    void Promise.all([loadQuotes(), loadStockDaily()]).then(() => {
      if (isMounted) {
        connectQuoteStream();
      }
    });

    return () => {
      isMounted = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      stopFallbackPolling();
      ws?.close();
    };
  }, [symbol]);

  const chartData = useMemo(() => {
    const sorted = [...quotes].sort((a, b) => {
      const timeA = parseDateTime(a.created_at)?.getTime() ?? 0;
      const timeB = parseDateTime(b.created_at)?.getTime() ?? 0;
      return timeA - timeB;
    });

    return sorted.map((quote) => ({
      time: parseDateTime(quote.created_at),
      timeLabel: quote.created_at,
      price: quote.price_current,
      ema20: quote.ema_20,
      ema100: quote.ema_100,
      changePercent: quote.change_percent,
      changePrice: quote.change_price,
    }));
  }, [quotes]);

  const xAxisLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    let lastDate = "";
    chartData.forEach((item) => {
      const [datePart, timePart] = item.timeLabel.split(" ");
      const timeOnly = timePart?.slice(0, 5) ?? "";
      if (datePart && timeOnly) {
        if (datePart !== lastDate) {
          map[item.timeLabel] = `${datePart}\n${timeOnly}`;
          lastDate = datePart;
        } else {
          map[item.timeLabel] = timeOnly;
        }
      } else {
        map[item.timeLabel] = item.timeLabel;
      }
    });
    return map;
  }, [chartData]);

  useEffect(() => {
    const container = chartScrollRef.current;
    if (!container) return;
    if (!hasInitialScroll.current) {
      hasInitialScroll.current = true;
      return;
    }
    container.scrollLeft = container.scrollWidth;
  }, [chartData.length]);

  const yTicks = useMemo(() => {
    if (chartData.length === 0) return [];
    const values = chartData.flatMap((item) => [
      item.price,
      item.ema20,
      item.ema100,
    ]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const steps = 5;
    const stepSize = (max - min) / (steps - 1 || 1);
    return Array.from({ length: steps }, (_, index) => {
      const value = max - stepSize * index;
      return Number.isFinite(value) ? value : max;
    });
  }, [chartData]);

  return (
    <>
      <Head>
        <title>Daily Detail</title>
      </Head>
      <Navbar />
      <main style={{ padding: "24px" }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton
              aria-label="Back"
              onClick={() => router.back()}
              size="small"
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Daily Detail
            </Typography>
          </Stack>
          <Stack
            direction={isMobile ? "column" : "row"}
            spacing={3}
            alignItems="flex-start"
            sx={{ width: "100%", justifyContent: "space-between" }}
          >
            <Stack spacing={1} sx={{ flex: 1 }}>
              <Typography>Symbol: {symbol ?? "-"}</Typography>
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{ flexWrap: "wrap", rowGap: 1 }}
              >
                <Typography variant="body2">
                  Latest Change Percent:{" "}
                  <strong>
                    {chartData.length > 0
                      ? `${chartData[chartData.length - 1].changePercent.toFixed(
                          2
                        )}%`
                      : "-"}
                  </strong>
                </Typography>
                <Typography variant="body2">
                  Latest Change Price:{" "}
                  <strong>
                    {chartData.length > 0
                      ? `${chartData[chartData.length - 1].changePrice} USD`
                      : "-"}
                  </strong>
                </Typography>
                <Typography variant="body2">
                  Price Current:{" "}
                  <strong>
                    {chartData.length > 0
                      ? `${chartData[chartData.length - 1].price} USD`
                      : "-"}
                  </strong>
                </Typography>
              </Stack>
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{ flexWrap: "wrap", rowGap: 1 }}
              >
                <Typography variant="body2">
                  High:{" "}
                  <strong>
                    {stockDaily ? `${stockDaily.price_high} USD` : "-"}
                  </strong>
                </Typography>
                <Typography variant="body2">
                  Low:{" "}
                  <strong>
                    {stockDaily ? `${stockDaily.price_low} USD` : "-"}
                  </strong>
                </Typography>
                <Typography variant="body2">
                  Open:{" "}
                  <strong>
                    {stockDaily ? `${stockDaily.price_open} USD` : "-"}
                  </strong>
                </Typography>
                <Typography variant="body2">
                  Prev Close:{" "}
                  <strong>
                    {stockDaily ? `${stockDaily.price_prev_close} USD` : "-"}
                  </strong>
                </Typography>
              </Stack>
            </Stack>
            <Box
              sx={{
                width: isMobile ? "100%" : "auto",
                minWidth: isMobile ? 0 : 260,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                padding: 1.5,
                bgcolor: "background.paper",
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 700, color: scoreEmaColor(latestAlertForSymbol?.event?.score_ema),}}>
                {latestAlertForSymbol?.message ?? "Stable"}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  mt: 0.5,
                  color: scoreEmaColor(latestAlertForSymbol?.event?.score_ema),
                }}
              > 
                score ema: {latestAlertForSymbol?.event?.score_ema ?? "-"} (
                {latestAlertForSymbol?.event?.trend_ema_20 ?? "-"},{" "}
                {latestAlertForSymbol?.event?.trend_tanh_ema ?? "-"})
              </Typography>
              <Typography variant="body2">
                score price cross ema:{" "}
                {latestAlertForSymbol?.event?.score_p_cross_ema ?? "-"}
              </Typography>
            </Box>
          </Stack>
          {isLoading ? <Typography>Loading...</Typography> : null}
          {error ? <Typography color="error">{error}</Typography> : null}
          {!isLoading && !error && chartData.length > 0 ? (
            <Stack spacing={1}>
              <div style={{ display: "flex", gap: "12px" }}>
                <div
                  style={{
                    width: "64px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    height: "330px",
                    padding: "0",
                    boxSizing: "border-box",
                    color: "#4b5563",
                    fontSize: "12px",
                  }}
                >
                  {yTicks.map((tick) => (
                    <div key={tick}>{tick.toFixed(2)}</div>
                  ))}
                </div>
                <div
                  ref={chartScrollRef}
                  style={{ width: "100%", overflowX: "auto" }}
                >
                  <LineChart
                    height={360}
                    width={Math.max(1200, chartData.length * 18)}
                    margin={{ right: 220 }}
                    series={[
                      {
                        data: chartData.map((item) => item.price),
                        label: "Price",
                        color: "#2563eb",
                        showMark: ({ index }) => index === chartData.length - 1,
                      },
                      {
                        data: chartData.map((item) => item.ema20),
                        label: "EMA 20",
                        color: "#f59e0b",
                        showMark: ({ index }) => index === chartData.length - 1,
                      },
                      {
                        data: chartData.map((item) => item.ema100),
                        label: "EMA 100",
                        color: "#16a34a",
                        showMark: ({ index }) => index === chartData.length - 1,
                      },
                    ]}
                    xAxis={[
                      {
                        data: chartData.map((item) => item.timeLabel),
                        scaleType: "band",
                        label: "Time (minute)",
                        valueFormatter: (value) => {
                          if (typeof value !== "string") return String(value);
                          return xAxisLabelMap[value] ?? value;
                        },
                      },
                    ]}
                    yAxis={[
                      {
                        tickLabelStyle: { display: "none" },
                        disableLine: true,
                        disableTicks: true,
                      },
                    ]}
                  />
                </div>
              </div>
            </Stack>
          ) : null}
          {!isLoading && !error && chartData.length === 0 ? (
            <Typography>No data available.</Typography>
          ) : null}
        </Stack>
      </main>
    </>
  );
}



