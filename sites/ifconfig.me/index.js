export default {
  id: "ifconfig.me",
  name: "ifconfig.me",
  domain: "ifconfig.me",
  description: "Get your public IP address and connection details from ifconfig.me",
  cookies: "optional",
  parameters: [
    { name: "json", type: "boolean", description: "Return full connection details in JSON format" }
  ],
  run: async (ctx) => {
    const data = await ctx.http.json("https://ifconfig.me/all.json");
    if (ctx.options.json) {
      return data;
    }
    return data.ip_addr;
  }
};
