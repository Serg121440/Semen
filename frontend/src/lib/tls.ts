if (process.env.BACKEND_ALLOW_SELF_SIGNED_TLS === "true") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}
