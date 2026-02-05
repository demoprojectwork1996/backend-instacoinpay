const axios = require("axios");

const sendTransactionMail = async ({
  to,
  template,
  variables,
  templateKey,
  mergeInfo,
}) => {
  try {
    // 🔧 BUG FIX (NO LOGIC CHANGE)
    const finalTemplate = template || templateKey;
    const finalVariables = variables || mergeInfo;

    console.log("📧 Attempting to send email:", {
      to,
      template: finalTemplate
        ? finalTemplate.substring(0, 20) + "..."
        : "MISSING",
      variables: finalVariables,
    });

    if (!to || !finalTemplate || !finalVariables) {
      console.error("❌ Missing required email parameters:", {
        to: !!to,
        template: !!finalTemplate,
        variables: !!finalVariables,
      });
      return null;
    }

    if (!process.env.ZEPTOMAIL_API_KEY) {
      console.error("❌ ZEPTOMAIL_API_KEY not found in environment");
      return null;
    }

    if (!process.env.ZEPTOMAIL_FROM) {
      console.error("❌ ZEPTOMAIL_FROM not found in environment");
      return null;
    }

    // ZeptoMail requires string merge values
    const stringVars = {};
    for (const [key, value] of Object.entries(finalVariables)) {
      stringVars[key] = String(value ?? "");
    }

    const payload = {
      mail_template_key: finalTemplate,
      from: {
        address: process.env.ZEPTOMAIL_FROM,
        name: "InstaCoinXPay",
      },
      to: [
        {
          email_address: {
            address: to,
            name: stringVars.userName || "User",
          },
        },
      ],
      merge_info: stringVars,
    };

    const res = await axios.post(
      "https://api.zeptomail.in/v1.1/email/template",
      payload,
      {
        headers: {
          Authorization: process.env.ZEPTOMAIL_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    console.log("✅ ZEPTOMAIL SENT SUCCESSFULLY:", {
      to,
      status: res.status,
      messageId: res.data?.data?.[0]?.message_id || "N/A",
    });

    return res.data;
  } catch (err) {
    console.error("❌ ZEPTOMAIL ERROR DETAILS:", {
      to,
      status: err.response?.status,
      data: err.response?.data,
    });
    return null;
  }
};

module.exports = sendTransactionMail;
