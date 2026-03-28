const SITE_DATA_PATH = 'site-data.json';

function buildHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: buildHeaders(),
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: buildHeaders(),
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, {
      error: 'Method not allowed.'
    });
  }

  const githubToken = `${process.env.GITHUB_TOKEN || ''}`.trim();
  const githubOwner = `${process.env.GITHUB_OWNER || 'ramyslman1-code'}`.trim();
  const githubRepo = `${process.env.GITHUB_REPO || 'Accounting-Systems-Doctor'}`.trim();
  const githubBranch = `${process.env.GITHUB_BRANCH || 'main'}`.trim() || 'main';
  const publishSecret = `${process.env.PUBLISH_SECRET || ''}`.trim();

  if (!githubToken || !publishSecret) {
    return jsonResponse(500, {
      error: 'Publish service is not configured yet. Add GITHUB_TOKEN and PUBLISH_SECRET in Netlify environment variables.'
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (error) {
    return jsonResponse(400, {
      error: 'Invalid JSON payload.'
    });
  }

  const providedSecret = `${payload.publishSecret || ''}`.trim();
  if (!providedSecret || providedSecret !== publishSecret) {
    return jsonResponse(403, {
      error: 'Invalid publish secret.'
    });
  }

  if (!payload.siteData || typeof payload.siteData !== 'object' || Array.isArray(payload.siteData)) {
    return jsonResponse(400, {
      error: 'Missing site data payload.'
    });
  }

  const githubHeaders = {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'accounting-systems-doctor-admin'
  };

  const getFileUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${SITE_DATA_PATH}?ref=${encodeURIComponent(githubBranch)}`;
  const updateFileUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${SITE_DATA_PATH}`;

  try {
    const currentFileResponse = await fetch(getFileUrl, {
      headers: githubHeaders
    });

    const currentFileData = await currentFileResponse.json();
    if (!currentFileResponse.ok || !currentFileData.sha) {
      throw new Error(currentFileData.message || 'Unable to read the current site-data.json file from GitHub.');
    }

    const serializedSiteData = `${JSON.stringify(payload.siteData, null, 2)}\n`;
    const encodedContent = Buffer.from(serializedSiteData, 'utf8').toString('base64');

    const updateResponse = await fetch(updateFileUrl, {
      method: 'PUT',
      headers: githubHeaders,
      body: JSON.stringify({
        message: 'Update site data from admin panel',
        content: encodedContent,
        sha: currentFileData.sha,
        branch: githubBranch
      })
    });

    const updateData = await updateResponse.json();
    if (!updateResponse.ok) {
      throw new Error(updateData.message || 'Unable to publish site data to GitHub.');
    }

    return jsonResponse(200, {
      ok: true,
      message: 'Site data published successfully.',
      commitUrl: updateData.commit?.html_url || ''
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error.message || 'Unexpected publish error.'
    });
  }
};
