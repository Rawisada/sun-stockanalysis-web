import Head from "next/head";
import type { GetServerSideProps } from "next";
import Navbar from "@/components/Navbar";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api";

type Stock = {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  exchange: string;
  asset_type: string;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type StockResponse = {
  status?: {
    code?: string;
    message?: string;
  };
  data?: Stock[];
};

const parseCookies = (cookieHeader: string | undefined) => {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) {
    return cookies;
  }
  cookieHeader.split(";").forEach((pair) => {
    const [rawKey, ...rawValue] = pair.trim().split("=");
    if (!rawKey) {
      return;
    }
    cookies[rawKey] = decodeURIComponent(rawValue.join("="));
  });
  return cookies;
};

export const getServerSideProps: GetServerSideProps = async (
  context
) => {
  const cookies = parseCookies(context.req.headers.cookie);
  const accessToken = cookies.access_token;
  const refreshToken = cookies.refresh_token;

  if (!accessToken && !refreshToken) {
    return {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    };
  }

  return {
    props: {},
  };
};

const getAccessTokenFromCookie = () => {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie.match(/(?:^|; )access_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
};

export default function HomePage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLoginSuccess, setShowLoginSuccess] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const shouldShow = sessionStorage.getItem("show_login_success_popup") === "1";
    if (shouldShow && isMobile) {
      setShowLoginSuccess(true);
    }
    if (shouldShow) {
      sessionStorage.removeItem("show_login_success_popup");
    }
  }, [isMobile]);

  useEffect(() => {
    let isMounted = true;
    const loadStocks = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const accessToken = getAccessTokenFromCookie();
        const data = await fetchJson<StockResponse>("/v1/stocks", {
          method: "GET",
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : undefined,
        });
        if (isMounted) {
          setStocks(data.data ?? []);
        }
      } catch (err) {
        if (isMounted) {
          const message = err instanceof Error ? err.message : "Load failed";
          setError(message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadStocks();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <>
      <Head>
        <title>Home</title>
      </Head>
      <Navbar />
      <main style={{ padding: "24px" }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          Stocks
        </Typography>
        {isLoading ? <Typography>Loading...</Typography> : null}
        {error ? <Typography color="error">{error}</Typography> : null}
        {!isLoading && !error ? (
          <Stack spacing={1.5}>
            {stocks.map((stock) => (
              <Stack
                key={stock.id}
                direction="row"
                spacing={1}
                alignItems="center"
              >
                <Typography sx={{ minWidth: 80, fontWeight: 600 }}>
                  {stock.symbol}
                </Typography>
                <Button
                  component={Link}
                  href={`/detail/daily/${stock.symbol}`}
                  variant="outlined"
                  size="small"
                  sx={{ textTransform: "none" }}
                >
                  Daily
                </Button>
                <Button
                  component={Link}
                  href={`/detail/overall/${stock.symbol}`}
                  variant="outlined"
                  size="small"
                  sx={{ textTransform: "none" }}
                >
                  Overall
                </Button>
                <Button
                  component={Link}
                  href={`/detail/news/${stock.symbol}`}
                  variant="outlined"
                  size="small"
                  sx={{ textTransform: "none" }}
                >
                  News
                </Button>
              </Stack>
            ))}
          </Stack>
        ) : null}
      </main>
      <Snackbar
        open={showLoginSuccess}
        autoHideDuration={2500}
        onClose={() => setShowLoginSuccess(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setShowLoginSuccess(false)}
          severity="success"
          variant="filled"
          sx={{ width: "100%" }}
        >
          Login successful
        </Alert>
      </Snackbar>
    </>
  );
}
