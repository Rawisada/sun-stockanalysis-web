import Head from "next/head";
import Navbar from "@/components/Navbar";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useRouter } from "next/router";

export default function StockDetailOverallPage() {
  const router = useRouter();
  const symbol = Array.isArray(router.query.symbol)
    ? router.query.symbol[0]
    : router.query.symbol;

  return (
    <>
      <Head>
        <title>Overall Detail</title>
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
              Overall Detail
            </Typography>
          </Stack>
          <Typography>Symbol: {symbol ?? "-"}</Typography>
          <Typography>Coming soon.</Typography>
        </Stack>
      </main>
    </>
  );
}
