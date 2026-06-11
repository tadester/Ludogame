import type { APIRequestContext } from "@playwright/test";

const mailpitUrl = "http://127.0.0.1:55324";

type MailpitMessageSummary = {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
};

type MailpitMessageList = {
  messages: MailpitMessageSummary[];
};

type MailpitMessage = {
  HTML: string;
};

export async function clearMailpit(request: APIRequestContext) {
  const response = await request.delete(`${mailpitUrl}/api/v1/messages`);
  if (!response.ok()) {
    throw new Error(`Unable to clear Mailpit: ${response.status()}`);
  }
}

export async function waitForEmailLink(
  request: APIRequestContext,
  recipient: string,
  subject: string,
) {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const listResponse = await request.get(`${mailpitUrl}/api/v1/messages`);
    const list = (await listResponse.json()) as MailpitMessageList;
    const summary = list.messages.find(
      (message) =>
        message.Subject === subject &&
        message.To.some((address) => address.Address === recipient),
    );

    if (summary) {
      const messageResponse = await request.get(
        `${mailpitUrl}/api/v1/message/${summary.ID}`,
      );
      const message = (await messageResponse.json()) as MailpitMessage;
      const href = message.HTML.match(/href="([^"]+)"/)?.[1];

      if (!href) {
        throw new Error(`No link found in Mailpit message ${summary.ID}`);
      }

      return href.replaceAll("&amp;", "&");
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for "${subject}" to ${recipient}`);
}
