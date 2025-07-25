import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { parseMSProjectXML } from '@/utils/leadUtils';

const defaultFullAnalysisPrompt = `
You are “ScheduleSensei,” a senior CPM scheduling consultant with 20+ years of commercial‑ and industrial‑project expertise.

────────────────────────────────────────────────────────
🎯  Mission
1. Perform a comprehensive health check of the schedule JSON I provide.  
2. Pinpoint weaknesses—especially in **durations** and **logic sequence** (predecessor / successor links).  
3. Recommend specific, actionable fixes, ranked by impact.  
4. Ask concise follow‑up questions only when essential.  
5. State any assumptions that drive your recommendations.

────────────────────────────────────────────────────────
📦  Input Format
I will paste a JSON array of task objects. Each object contains:  
• `id` ‑ unique ID • `name` ‑ activity description  
• `duration` ‑ ISO‑8601 (e.g., `PT64H0M0S`) – assume 8 h per workday if no calendar provided  
• `start` / `finish` ‑ ISO‑8601 datetimes  
• `predecessors` / `successors` ‑ arrays of `{id, type, lag, lagFormat}`  
Relationship codes: 1 FS 2 SS 3 FF 4 SF.  
Ignore objects where `"summary": true` unless I ask otherwise.

────────────────────────────────────────────────────────
📑  Deliverables

**A. High‑Level Health Check** (≤ 10 bullets)  
- Unrealistic durations (flag ±30 % vs. norms)  
- Missing / dangling logic, circular links, redundant ties  
- Activities with low or negative float threatening the critical path  

**B. Detailed Activity Review** – for each flagged task  

**C. Priority Fix List** – ranked 1‑N by schedule benefit.

**D. Follow‑Up Questions** – only if vital to refine advice.

────────────────────────────────────────────────────────
⚙️  Analysis Guidelines
• Convert `duration` and `lag` strings into work‑days for clarity.  
• Highlight crew‑flow gaps >1 day beyond defined lags.  
• Check that permitting, inspections, long‑lead procurement, and weather windows are logically placed.  
• When proposing logic edits, list the **exact** predecessor/successor IDs to add, drop, or change.  
• If resource data is absent, note where overallocation risk is likely and suggest verification.

────────────────────────────────────────────────────────
<<< PASTE YOUR JSON SCHEDULE HERE >>>
`;

const specificQuestionPrompt = `
You are “ScheduleSensei,” a veteran CPM scheduler who delivers crisp, data‑backed answers.

────────────────────────────────────────────────────────
🎯  Mission
1. Address my **SPECIFIC QUESTION** first—directly and decisively.  
2. Support the answer with only the analysis needed to justify it (max 6 bullets).  
3. Use the full schedule JSON I provide **for context**, but don’t produce a full audit unless I request it later.  
4. Ask follow‑up questions only if absolutely essential.  
5. State any assumptions that influence your recommendations.

────────────────────────────────────────────────────────
📝  How I Will Prompt You
• Paste **the entire schedule** (or a trimmed version) so you can reference IDs, lags, float, etc., without me spelling them out in the question.

────────────────────────────────────────────────────────
📦  JSON Schema (for reference)
Key fields: `id`, `name`, `duration` (ISO‑8601), `start`, `finish`, `predecessors`, `successors`  
Relationship codes: 1 FS 2 SS 3 FF 4 SF.  
Assume 8 h = 1 workday if no calendar supplied.

────────────────────────────────────────────────────────
📑  Response Structure
**1. Direct Answer to Specific Question** – 1‑3 tight paragraphs *or* a concise bullet list.  
**2. Key Data Points Referenced** – cite task IDs, lag values, float impacts.  
**3. Quick‑Hit Suggestions** (≤ 6 bullets) – only if they add clear, immediate value.  
*(Skip a full schedule audit unless I ask for it later.)*

────────────────────────────────────────────────────────
⚙️  Micro‑Guidelines
• Parse ISO durations/lags into work‑days before reasoning.  
• Leverage the full JSON for context, but keep the response narrowly focused.  
• If clarification is essential, ask it in **one** short question, then pause.  

────────────────────────────────────────────────────────
SPECIFIC QUESTION: [USER_QUESTION_HERE]

<<<  FULL SCHEDULE JSON BELOW  >>>
[PASTE_JSON_HERE]
`;

const ScheduleConsultant = () => {
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [xmlParseError, setXmlParseError] = useState<string | null>(null);
  const [parsedTasks, setParsedTasks] = useState<any[] | null>(null);
  const [aiQuestion, setAiQuestion] = useState('');
  const [parsing, setParsing] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Handler for file input
  const handleXmlFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setXmlFile(e.target.files[0]);
      setParsedTasks(null);
      setXmlParseError(null);
      setAiResponse(null);
    }
  };

  // Handler for parsing XML
  const handleParseXml = async () => {
    if (!xmlFile) return;
    setParsing(true);
    setXmlParseError(null);
    setParsedTasks(null);
    setAiResponse(null);
    try {
      const text = await xmlFile.text();
      const tasks = parseMSProjectXML(text);
      setParsedTasks(tasks);
    } catch (err) {
      setXmlParseError('Failed to parse XML. Please check the file format.');
    } finally {
      setParsing(false);
    }
  };

  // Handler for sending to OpenAI
  const handleSendToAI = async () => {
    if (!parsedTasks || parsedTasks.length === 0) {
      setAiError('No parsed schedule data to send.');
      return;
    }
    if (!apiKey) {
      setAiError('Please enter your OpenAI API key.');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    setAiResponse(null);
    let promptToSend = '';
    if (aiQuestion.trim() === '') {
      promptToSend = defaultFullAnalysisPrompt.replace(
        '<<< PASTE YOUR JSON SCHEDULE HERE >>>',
        JSON.stringify(parsedTasks, null, 2)
      );
    } else {
      promptToSend = specificQuestionPrompt
        .replace('[USER_QUESTION_HERE]', aiQuestion.trim())
        .replace('[PASTE_JSON_HERE]', JSON.stringify(parsedTasks, null, 2));
    }
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            { role: 'system', content: 'You are ScheduleSensei, a senior CPM scheduling consultant.' },
            { role: 'user', content: promptToSend },
          ],
          max_tokens: 1200,
          temperature: 0.2,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'OpenAI API error');
      }
      const data = await response.json();
      setAiResponse(data.choices[0].message.content);
    } catch (err: any) {
      setAiError(err.message || 'Failed to get response from OpenAI.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col items-center py-10">
      <div className="w-full max-w-3xl bg-white/80 rounded shadow p-8 border">
        <h1 className="text-2xl font-bold mb-2 text-gulker-navy-800">AI Scheduling Consultant</h1>
        <p className="mb-6 text-gulker-navy-600">Upload a Microsoft Project XML file and ask a question to get a full schedule breakdown and AI advice.</p>
        <div className="flex flex-col md:flex-row gap-4 items-end mb-4">
          <div>
            <label className="block text-sm font-medium text-gulker-navy-700 mb-1">Upload MS Project XML</label>
            <input type="file" accept=".xml" onChange={handleXmlFileChange} className="block" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gulker-navy-700 mb-1">Question for AI Consultant <span className="text-xs text-gray-500">(leave blank for full analysis)</span></label>
            <input
              type="text"
              value={aiQuestion}
              onChange={e => setAiQuestion(e.target.value)}
              placeholder="e.g. What is the critical path?"
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <Button onClick={handleParseXml} disabled={!xmlFile || parsing} className="bg-gulker-teal text-white">
            {parsing ? 'Parsing...' : 'Parse & Preview'}
          </Button>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gulker-navy-700 mb-1">OpenAI API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full border rounded px-3 py-2"
          />
        </div>
        {xmlParseError && <div className="text-red-600 mt-2">{xmlParseError}</div>}
        {parsedTasks && (
          <div className="mt-4 p-3 bg-gray-50 border rounded">
            <div className="font-medium text-gulker-navy-700 mb-1">Parsed {parsedTasks.length} tasks.</div>
            {parsedTasks.length > 0 && (
              <pre className="text-xs bg-white p-2 rounded border overflow-x-auto max-h-40">{JSON.stringify(parsedTasks[0], null, 2)}</pre>
            )}
            <Button onClick={handleSendToAI} disabled={aiLoading} className="mt-4 bg-gulker-navy-700 text-white">
              {aiLoading ? 'Consulting AI...' : 'Send to AI'}
            </Button>
            {aiError && <div className="text-red-600 mt-2">{aiError}</div>}
            {aiResponse && (
              <div className="mt-4 p-4 bg-white border rounded text-sm whitespace-pre-line" style={{ maxHeight: 400, overflowY: 'auto' }}>
                <strong>AI Response:</strong>
                <div className="mt-2">{aiResponse}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScheduleConsultant; 