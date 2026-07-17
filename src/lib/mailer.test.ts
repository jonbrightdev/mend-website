import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendMail } from "@/lib/mailer";

// The dev fallback is what makes the auth flows runnable with no email service,
// so it is worth pinning: unset credentials must never reach the network.

const mail = { to: "ada@example.com", subject: "Reset your Mend password", text: "link" };

describe("sendMail", () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it("logs to the console and does not fetch when unconfigured", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(sendMail(mail)).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("ada@example.com"));
  });

  // A half-configured environment is the likely deploy mistake — falling back to
  // the console beats throwing on every reset request.
  it.each([
    ["only RESEND_API_KEY", { RESEND_API_KEY: "re_fake", EMAIL_FROM: undefined }],
    ["only EMAIL_FROM", { RESEND_API_KEY: undefined, EMAIL_FROM: "Mend <a@b.co>" }],
  ])("falls back to the console with %s set", async (_label, vars) => {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await sendMail(mail);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts to Resend when fully configured", async () => {
    process.env.RESEND_API_KEY = "re_fake";
    process.env.EMAIL_FROM = "Mend <noreply@example.com>";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(sendMail(mail)).resolves.toBeUndefined();

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(String(init!.body))).toEqual({
      from: "Mend <noreply@example.com>",
      to: "ada@example.com",
      subject: "Reset your Mend password",
      text: "link",
    });
  });

  it("throws when Resend rejects the send", async () => {
    process.env.RESEND_API_KEY = "re_fake";
    process.env.EMAIL_FROM = "Mend <noreply@example.com>";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unauthorized", { status: 401 }),
    );

    await expect(sendMail(mail)).rejects.toThrow("mail send failed: 401 unauthorized");
  });
});
