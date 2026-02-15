import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useRouter } from "next/router";
import { clearCookie } from "@/lib/api";

type NavItem = {
  label: string;
  href: string;
};

const navItems: NavItem[] = [{ label: "Home", href: "/" }];

export default function Navbar() {
  const router = useRouter();

  const handleLogout = async () => {
    clearCookie("access_token");
    clearCookie("refresh_token");
    await router.push("/login");
  };

  return (
    <AppBar position="static" color="default" elevation={1}>
      <Toolbar sx={{ gap: 2 }}>
        <Typography
          variant="h6"
          component="div"
          sx={{ flexGrow: 1, fontWeight: 700 }}
        >
          Sun Stock Analysis
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          {navItems.map((item) => (
            <Button
              key={item.href}
              component={Link}
              href={item.href}
              color="inherit"
              sx={{ textTransform: "none" }}
            >
              {item.label}
            </Button>
          ))}
          <Button
            color="inherit"
            onClick={handleLogout}
            sx={{ textTransform: "none" }}
          >
            Logout
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
