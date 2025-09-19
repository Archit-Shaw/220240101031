// src/App.jsx
import React, { useState, useEffect } from "react";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Grid,
  TextField,
  Button,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Box,
  Fab,
  List,
  ListItem,
  ListItemText,
  Divider,
  Snackbar,
  Alert,
  CircularProgress,
  Tooltip,
  InputAdornment,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LaunchIcon from "@mui/icons-material/Launch";
import RefreshIcon from "@mui/icons-material/Refresh";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import axios from "axios";

/*
  This App.jsx is a modernized Material UI frontend for URL Shortener.
  It expects an axios `api` base and `clientLog` function for logging.
  If you already have those, remove the local definitions and import them.
*/

// ====== minimal api & logging helpers (replace with your existing ones if present) ======
const BASE_API = process.env.REACT_APP_BASE_API || "http://localhost:4000";
const LOG_ENDPOINT = "http://20.244.56.144/evaluation-service/logs";
const LOG_TOKEN = process.env.REACT_APP_LOGGING_AUTH_TOKEN || "";

async function clientLog(stack = "frontend", level = "info", pkg = "component", message = "") {
  if (!LOG_TOKEN) return;
  try {
    await axios.post(
      LOG_ENDPOINT,
      { stack, level, package: pkg, message },
      { headers: { Authorization: `Bearer ${LOG_TOKEN}` }, timeout: 3000 }
    );
  } catch (e) {
    // swallow
  }
}
const api = axios.create({ baseURL: BASE_API, timeout: 12000 });

// ====== theme ======
const theme = createTheme({
  palette: {
    primary: { main: "#1976d2" },
    background: { default: "#f4f7fb" },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCard: { defaultProps: { elevation: 3 } },
  },
});

// ====== validation helpers ======
function validateUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (e) {
    return false;
  }
}
function validateShortcode(code) {
  if (!code) return true;
  return /^[A-Za-z0-9_-]{3,30}$/.test(code);
}

// ====== Main App ======
function ShortenForm({ onResult }) {
  const [rows, setRows] = useState([{ url: "", validity: 30, shortcode: "" }]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  function addRow() {
    if (rows.length >= 5) {
      setToast({ severity: "info", message: "Maximum 5 URLs allowed" });
      return;
    }
    setRows((s) => [...s, { url: "", validity: 30, shortcode: "" }]);
  }
  function updateRow(i, changes) {
    setRows((s) => s.map((r, idx) => (idx === i ? { ...r, ...changes } : r)));
  }

  async function submitAll() {
    // client-side validation
    for (const r of rows) {
      if (!r.url) {
        setToast({ severity: "error", message: "Please provide all URLs" });
        return;
      }
      if (!validateUrl(r.url)) {
        setToast({ severity: "error", message: `Invalid URL: ${r.url}` });
        return;
      }
      if (r.validity && (!Number.isInteger(Number(r.validity)) || Number(r.validity) <= 0)) {
        setToast({ severity: "error", message: "Validity must be a positive integer" });
        return;
      }
      if (!validateShortcode(r.shortcode)) {
        setToast({ severity: "error", message: "Shortcode must be 3-30 chars (letters, numbers, - or _)" });
        return;
      }
    }

    setLoading(true);
    const created = [];
    for (const p of rows) {
      try {
        clientLog("frontend", "info", "api", `create_shorturl ${p.url}`);
        const res = await api.post("/shorturls", {
          url: p.url,
          validity: p.validity ? Number(p.validity) : undefined,
          shortcode: p.shortcode || undefined,
        });
        created.push({ original: p.url, shortLink: res.data.shortLink, expiry: res.data.expiry });
        clientLog("frontend", "info", "api", `created ${res.data.shortLink}`);
      } catch (err) {
        const msg = err?.response?.data?.error || err.message;
        created.push({ original: p.url, error: msg });
        clientLog("frontend", "error", "api", `create_error ${msg}`);
      }
    }
    setLoading(false);
    onResult(created);
  }

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Grid container spacing={2} alignItems="center">
          {rows.map((r, i) => (
            <Grid container item spacing={1} key={i} alignItems="center">
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  size="small"
                  label={`Original URL #${i + 1}`}
                  value={r.url}
                  onChange={(e) => updateRow(i, { url: e.target.value })}
                />
              </Grid>
              <Grid item xs={6} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="Validity (mins)"
                  value={r.validity}
                  onChange={(e) => updateRow(i, { validity: e.target.value })}
                  InputProps={{ endAdornment: <InputAdornment position="end">mins</InputAdornment> }}
                />
              </Grid>
              <Grid item xs={6} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="Shortcode (optional)"
                  value={r.shortcode}
                  onChange={(e) => updateRow(i, { shortcode: e.target.value })}
                />
              </Grid>
              {i < rows.length - 1 && <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>}
            </Grid>
          ))}
        </Grid>
      </CardContent>
      <CardActions sx={{ justifyContent: "space-between", px: 2, pb: 2 }}>
        <Box>
          <Tooltip title="Add another URL (up to 5)">
            <Fab size="small" color="primary" onClick={addRow} aria-label="add-url">
              <AddIcon />
            </Fab>
          </Tooltip>
          <Button
            sx={{ ml: 2 }}
            variant="contained"
            onClick={submitAll}
            disabled={loading}
            startIcon={loading ? <CircularProgress color="inherit" size={20} /> : null}
          >
            Create Short Links
          </Button>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Tooltip title="Refresh">
            <IconButton onClick={() => window.location.reload()}><RefreshIcon /></IconButton>
          </Tooltip>
          <Typography variant="caption" color="text.secondary">
            Max 5 URLs • Validity defaults to 30 mins
          </Typography>
        </Box>
      </CardActions>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)}>
        {toast && <Alert severity={toast.severity}>{toast.message}</Alert>}
      </Snackbar>
    </Card>
  );
}

function ResultsList({ results }) {
  const [copied, setCopied] = useState(null);
  return (
    <Box>
      <Grid container spacing={2}>
        {results.map((r, idx) => (
          <Grid item xs={12} md={6} key={idx}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">Original</Typography>
                <Typography sx={{ wordBreak: "break-all" }}>{r.original}</Typography>

                {r.error ? (
                  <Alert severity="error" sx={{ mt: 1 }}>{r.error}</Alert>
                ) : (
                  <>
                    <Box sx={{ mt: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <Box>
                        <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                          <a href={r.shortLink} target="_blank" rel="noreferrer">{r.shortLink}</a>
                        </Typography>
                        <Typography variant="caption" color="text.secondary">Expiry: {new Date(r.expiry).toLocaleString()}</Typography>
                      </Box>
                      <Box>
                        <Tooltip title="Open link">
                          <IconButton component="a" href={r.shortLink} target="_blank" rel="noreferrer" size="large">
                            <LaunchIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Copy short link">
                          <IconButton
                            onClick={() => {
                              navigator.clipboard.writeText(r.shortLink);
                              setCopied(r.shortLink);
                              clientLog("frontend", "info", "component", "copied_shortlink");
                              setTimeout(() => setCopied(null), 1800);
                            }}
                            size="large"
                          >
                            <ContentCopyIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                    {copied === r.shortLink && <Typography variant="caption" color="primary">Copied!</Typography>}
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

function ShortenerPage() {
  const [results, setResults] = useState([]);
  return (
    <Container sx={{ mt: 4, mb: 6 }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 2 }}>URL Shortener</Typography>
      <ShortenForm onResult={setResults} />
      <ResultsList results={results} />
    </Container>
  );
}

function StatsPage() {
  const [list, setList] = useState([]);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchList(); }, []);

  async function fetchList() {
    setLoading(true);
    try {
      clientLog("frontend", "info", "api", "fetch_list");
      const res = await api.get("/shorturls");
      setList(res.data);
    } catch (e) {
      clientLog("frontend", "error", "api", "fetch_list_error");
    } finally {
      setLoading(false);
    }
  }

  async function fetchDetails(sc) {
    try {
      clientLog("frontend", "info", "api", `fetch_details ${sc}`);
      const res = await api.get(`/shorturls/${sc}`);
      setDetails(res.data);
    } catch (e) {
      clientLog("frontend", "error", "api", `fetch_details_error ${sc}`);
    }
  }

  return (
    <Container sx={{ mt: 4, mb: 6 }}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card sx={{ position: { md: "sticky" }, top: 96 }}>
            <CardContent>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Typography variant="h6">Short Links</Typography>
                <Tooltip title="Refresh"><IconButton onClick={fetchList}><RefreshIcon /></IconButton></Tooltip>
              </Box>
              {loading ? <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}><CircularProgress /></Box> : (
                <List dense sx={{ maxHeight: "60vh", overflow: "auto" }}>
                  {list.map((item) => (
                    <React.Fragment key={item.shortcode}>
                      <ListItem
                        button
                        onClick={() => fetchDetails(item.shortcode)}
                        sx={{ alignItems: "flex-start" }}
                      >
                        <ListItemText
                          primary={item.originalUrl}
                          secondary={`${item.shortLink} • clicks: ${item.clicksTotal || 0}`}
                        />
                      </ListItem>
                      <Divider component="li" />
                    </React.Fragment>
                  ))}
                  {list.length === 0 && <Typography variant="body2" color="text.secondary">No short links yet</Typography>}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          {details ? (
            <Card>
              <CardContent>
                <Typography variant="h6">Details for {details.shortcode}</Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>{details.originalUrl}</Typography>
                <Typography variant="caption" color="text.secondary">Created: {new Date(details.createdAt).toLocaleString()}</Typography><br/>
                <Typography variant="caption" color="text.secondary">Expiry: {new Date(details.expiryAt).toLocaleString()}</Typography>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2">Click events</Typography>
                  {details.clicks.length === 0 && <Typography variant="body2" color="text.secondary">No clicks yet</Typography>}
                  {details.clicks.map((c, i) => (
                    <Card key={i} variant="outlined" sx={{ mt: 1, p: 1 }}>
                      <Typography variant="body2">At: {new Date(c.timestamp).toLocaleString()}</Typography>
                      <Typography variant="body2">Referrer: {c.referrer || "—"}</Typography>
                      <Typography variant="body2">Geo: {c.geo?.country || "Unknown"}</Typography>
                    </Card>
                  ))}
                </Box>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent>
                <Typography variant="h6">Select a short link to view details</Typography>
                <Typography variant="body2" color="text.secondary">Click any item on the left to see analytics and click events.</Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>
    </Container>
  );
}

function TopBar() {
  return (
    <AppBar position="static" color="primary" elevation={4}>
      <Toolbar sx={{ minHeight: 64 }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>URL Shortener</Typography>
        <Button color="inherit" component={Link} to="/" sx={{ fontWeight: 600 }}>Shorten</Button>
        <Button color="inherit" component={Link} to="/stats" sx={{ fontWeight: 600 }}>Stats</Button>
      </Toolbar>
    </AppBar>
  );
}

export default function App() {
  useEffect(() => { clientLog("frontend", "info", "component", "app_started"); }, []);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <TopBar />
        <Routes>
          <Route path="/" element={<ShortenerPage />} />
          <Route path="/stats" element={<StatsPage />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}
