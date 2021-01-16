/**
 * Provides access to Apollo Ensemble functionality.
 */
//% color=190 weight=100 icon="\uf1e0" block="Ensemble"
namespace Ensemble
{
    const MAX_MESSAGE_LENGTH = 19;
    const MAX_NAME_LENGTH = 10;
    const POS_MSG_TYPE = 0;
    const POS_DEVICE_ID = POS_MSG_TYPE + 1;
    const POS_VALUE = POS_DEVICE_ID + 4;
    const POS_NAME = POS_VALUE + 4;

    const MSG_TYPE_YOU_ARE_GATEWAY = 100;
    const MSG_TYPE_DEVICE_ID = 99;
    const MSG_TYPE_VALUE_TO_ENSEMBLE = 98;
    const MSG_TYPE_VALUE_FROM_ENSEMBLE = 97;
    const MSG_TYPE_IDENTIFY = 96;

    const IDENTIFY_DELAY = 250;
    const IDENTIFY_ME = 5;
    
    let deviceName = "";
    let deviceId = control.deviceSerialNumber();
    let started = 0;
    let onReceivedValueHandler: (name: string, value: number) => void;
    let identify = 0;
    let rxBuffer = "";

    export let isGateway:boolean = false;
    
    function sendPacket(msgType:number, id:number, value:number, name:string)
    {
        let msg = pins.createBuffer(MAX_MESSAGE_LENGTH);
        msg.fill(0);
        msg.setUint8(POS_MSG_TYPE, msgType);
        msg.setNumber(NumberFormat.Int32LE, POS_DEVICE_ID, id);
        msg.setNumber(NumberFormat.Float32LE, POS_VALUE, value);
        name = name.substr(0, MAX_NAME_LENGTH);
        for(let i=0; i < name.length; i++)
        {
            msg.setUint8(POS_NAME + i, name.charCodeAt(i));
        }
        radio.sendBuffer(msg);
    }

    function sendId()
    {
        if (isGateway)
        {
            serial.writeLine("");
            serial.writeLine(MSG_TYPE_DEVICE_ID + "|" + deviceId + "|" + 0 + "|" + "gateway");
        }
        else
        {
            sendPacket(MSG_TYPE_DEVICE_ID, deviceId, 0, deviceName);
        }
    }

    control.inBackground(function ()
    {
        let zz = 1;
        let list = [];

        while(true)
        {
            if (started)
            {
                //basic.showNumber(identify);
                if (zz == 0)
                {
                    sendId();
                }
                if (++zz >= 10)
                {
                    zz = 0;
                }
                if (identify > 0)
                {
                    if (identify == IDENTIFY_ME)
                    {
                        // remember the leds
                        for(let i = 0; i < 5; i++) {
                            for(let j = 0; j < 5; j++) {
                                list[i*5+j] = led.pointBrightness(i, j);
                            }
                        }
                    }
                    if (identify % 2)
                    {
                        basic.showIcon(IconNames.Heart);
                    }
                    else
                    {
                        basic.clearScreen();
                    }
                    identify--;
                    if (identify == 0)
                    {
                        // restore the leds
                        for(let i = 0; i < 5; i++) {
                            for(let j = 0; j < 5; j++) {
                                led.plotBrightness(i, j,list[i*5+j]);
                            }
                        }
                    }
                }
            }
            pause(IDENTIFY_DELAY);
        }
    })

    radio.onReceivedBuffer(function (buff : Buffer)
    {
       let msgType = buff.getUint8(POS_MSG_TYPE);
       let devId = buff.getNumber(NumberFormat.Int32LE, POS_DEVICE_ID);
       let value = buff.getNumber(NumberFormat.Float32LE, POS_VALUE);
       let name = "";
       let i = 0;
       let ch = buff.getUint8(POS_NAME + i++);
       while((ch != 0) && (i < MAX_NAME_LENGTH))
       {
           let newCh = String.fromCharCode(ch);
           if (newCh == '|')
           {
               newCh = '_';
           }
           name = name + newCh;
           ch = buff.getUint8(POS_NAME + i++);
       }
        switch(msgType)
        {
            case MSG_TYPE_VALUE_FROM_ENSEMBLE:
                if ((devId == 0) || (devId == deviceId))
                {
                    if (onReceivedValueHandler)
                    {
                        onReceivedValueHandler(name, value);        
                    }
                }        
                break;           

            case MSG_TYPE_VALUE_TO_ENSEMBLE:
            case MSG_TYPE_DEVICE_ID:
                if (isGateway)
                {
                    serial.writeLine("");
                    serial.writeLine(msgType + "|" + devId + "|" + value + "|" + name);
                }
                break;
                
            case MSG_TYPE_IDENTIFY:
                if (devId == deviceId)
                {
                    identify = IDENTIFY_ME;
                }        
                break;
        }
    })

    function parseCommand(buff : string)
    {
        let toks = buff.split("|");
       // basic.showNumber(toks.length);

//       return;
        if (toks.length >= 4)
        {
            let msgType = parseInt(toks[0]);
            switch (msgType)
            {
                case MSG_TYPE_YOU_ARE_GATEWAY:
                    if (!isGateway)
                    {
                        isGateway = true;
                    }
                    break;

                case MSG_TYPE_VALUE_FROM_ENSEMBLE:
                    if (started && isGateway)
                    {
                        let devId = parseInt(toks[1]);
                        let value = parseFloat(toks[2]);
                        let name = toks[3];
                        if ((devId == 0) || (devId == deviceId))
                        {
                            if (onReceivedValueHandler)
                            {
                                onReceivedValueHandler(name, value);        
                            }
                        }        
                        if ((devId == 0) || (devId != deviceId))
                        {
                            sendPacket(msgType, devId, value, name);
                        }
                    }
                    break;
                    
                case MSG_TYPE_IDENTIFY:
                    //led.toggle(3,3);
                    if (started && isGateway)
                    {
                        let devId = parseInt(toks[1]);
                        let value = parseFloat(toks[2]);
                        let name = toks[3];
                        if (devId == deviceId)
                        {
                            identify = IDENTIFY_ME;
                        }        
                        else
                        {
                            sendPacket(msgType, devId, value, name);
                        }
                    }
                    break;
            }
        }
    }

    //serial.onDataReceived(serial.delimiters(Delimiters.Hash), function () 
    //{
       // led.toggleAll();
//        let buff = serial.readString();//.readUntil(serial.delimiters(Delimiters.Hash));
      //  return;
  //    parseCommand(buff);
    //});

    serial.onDataReceived(serial.delimiters(Delimiters.Hash), function () 
    {
        let rx = serial.readString();
       // serial.writeLine("rx " + rx.length);
        for(let i = 0; i < rx.length; i++)
        {
            let c = rx.charAt(i);
            if (c == '#')
            {
                parseCommand(rxBuffer);
                rxBuffer = "";
            }
            else if (rxBuffer.length < 30)
            {
                rxBuffer = rxBuffer + c;
            }
            else
            {
                rxBuffer = "";
            }
        }
    })

   /**
     * Registers code to run when the radio receives a value from Ensemble
     */
    //% help=ensemble/on-received-value
    //% blockId=ensemble_on_value_drag block="on ensemble received" blockGap=16
    //% useLoc="ensemble.onDataPacketReceived" draggableParameters=reporter
    export function onReceivedValue(cb: (name: string, value: number) => void)
    {
        onReceivedValueHandler = cb;
    }

    /**
     * Sends a named value to Ensemble
     */
    //% blockId=ensemble_send_value
    //% block="send|value %n %v"
    export function sendValue(name:string, value:number)
    {
        if (started)
        {
            if (isGateway)
            {
                serial.writeLine("");
                serial.writeLine(MSG_TYPE_VALUE_TO_ENSEMBLE + "|" + deviceId + "|" + value + "|" + name);
            }
            else
            {
                sendPacket(MSG_TYPE_VALUE_TO_ENSEMBLE, deviceId, value, name);
            }
        }
    }

    /**
     * Stops communications to Ensemble
     */
    //% blockId=ensemble_stop
    //% block="stop"
    export function stop()
    {
        deviceName = "";
        started = 0;
        sendId();
    }

    /**
     * Starts communications to Ensemble
     * @param name Name for this device;
     */
    //% blockId=ensemble_start
    //% block="start %n"
    export function start(name:string)
    {
        if (name.length > 0)
        {
            deviceName = name.substr(0, MAX_NAME_LENGTH).replace("|", "_");
        }
        else
        {
            deviceName = deviceId.toString();
        }
        started = 1;
        radio.setGroup(1);
        radio.setTransmitSerialNumber(true);
        serial.setTxBufferSize(128);
        serial.setRxBufferSize(64);
        serial.readString();
        sendId();
    }

}